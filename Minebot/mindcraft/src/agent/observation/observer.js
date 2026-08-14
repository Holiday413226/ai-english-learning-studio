/**
 * Observer — the top-level orchestrator for the event-driven observation
 * system (V2.1).
 *
 * Responsibilities:
 *   1. Tick entry-point (called from agent.update every 300ms).
 *   2. Polls EventDetector for state-change observations.
 *   3. Accepts direct events (sunrise, sunset, death, woke_up).
 *   4. Manages active_queue (pending context injection) and _archive
 *      (historical record for P2 long-term memory).
 *   5. Injects observation context into history on player message, or
 *      triggers a gentle proactive prompt after extended silence.
 *   6. Integrates MoodProvider (P1: empty) and CompanionBehaviorHook.
 *
 * Does NOT modify prompter, commands, skills, or modes.
 * All LLM interaction flows through the existing handleMessage path.
 */

import { EventDetector } from './event_detector.js';
import { NoveltyTracker } from './novelty_tracker.js';
import { CompanionBehaviorHook } from './companion_behavior.js';
import { AutoSpeechTrigger } from './auto_speech_trigger.js';
import { WorldStateManager } from './world_state.js';

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------
const DEFAULTS = {
    // Queue
    queueMaxSize: 8,
    queueMaxAgeMs: 300000,        // 5 min — stale observations expire

    // Silence-triggered proactive expression
    silenceThresholdMs: 300000,   // 5 min
    globalCooldownMs: 30000,      // 30 s min between proactive prompts
    periodicIntervalMs: 1200000,  // 20 min ambient observation

    // EventDetector scan throttle
    scanIntervalMs: 2000,
};

// ---------------------------------------------------------------------------
// MoodProvider (P1 default — returns empty)
// ---------------------------------------------------------------------------
class MoodProvider {
    /**
     * @param {object} observation
     * @param {object} [profile]
     * @returns {Promise<string[]>}  mood tags (empty in P1).
     */
    async getMoodTags(_observation, _profile) {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Observer
// ---------------------------------------------------------------------------
export class Observer {
    /**
     * @param {object} agent     The Agent instance.
     * @param {object} [config]  Overrides for DEFAULTS above.
     */
    constructor(agent, config = {}) {
        this.agent = agent;
        this.cfg = { ...DEFAULTS, ...config };

        // ---- Sub-modules ----
        // NoveltyTracker: restore previous familiarity from saved state
        const savedState = agent.history?.savedNoveltyState || null;
        this.novelty = new NoveltyTracker(savedState);

        this.detector = new EventDetector(agent, this.novelty, {
            scanIntervalMs: this.cfg.scanIntervalMs,
        });

        this.companion = new CompanionBehaviorHook(agent);
        this.mood = new MoodProvider();
        this.autoSpeech = new AutoSpeechTrigger();

        // V5: World State Manager — ground-truth state layer
        this.worldState = new WorldStateManager();

        // ---- Observation queues ----
        /** @type {object[]}  Observations waiting for context injection. */
        this.active_queue = [];

        /** @type {object[]}  V2.1: archive of injected observations (P2 data source). */
        this._archive = [];
        this._archiveMax = 100;

        // ---- Expression / silence tracking ----
        this._lastPlayerMessageTime = Date.now();
        this._lastProactiveExpression = 0;
        this._lastPeriodicObservation = 0;

        // Event ID dedup set for this session (prevents re-enqueue)
        this._seenEventIds = new Set();

        // ---- Bind onEvent as the direct-event bridge for agent.js listeners ----
        this.onEvent = this._onDirectEvent.bind(this);
    }

    // ------------------------------------------------------------------
    // Tick entry (called from agent.update)
    // ------------------------------------------------------------------

    /**
     * @param {number} delta  ms since last agent.update().
     */
    async update(delta) {
        const bot = this.agent.bot;
        if (!bot || !bot.entity) return;
        const now = Date.now();

        // 1. Poll state-change detector
        const observations = this.detector.poll(delta);

        // 2. Enqueue
        for (const obs of observations) {
            this._enqueue(obs);
        }

        // V3 Reflex: check for immediate-reaction (L1/L2) events
        // Runs right after enqueue, BEFORE idle/silence blocks.
        // Does NOT require idle time — high-attention events trigger instantly.
        this._checkReflexTrigger(now);

        // 3. Periodic ambient observation
        if (now - this._lastPeriodicObservation > this.cfg.periodicIntervalMs) {
            this._lastPeriodicObservation = now;
            const periodicObs = this._buildPeriodicObservation(now);
            if (periodicObs) this._enqueue(periodicObs);
        }

        // 4. Silence-triggered proactive expression
        this._checkSilence(now);

        // 5. Let companion behaviours react to idle ticks
        if (this.agent.isIdle && this.agent.isIdle()) {
            this.companion.tick(delta);
            // V3: attention-based idle speech (L3 — aggregation ≥ 1.2 + idle ≥ 2min)
            this._checkAttentionTrigger(now);
        }
    }

    // ------------------------------------------------------------------
    // Direct event bridge (called by agent.js event listeners)
    // ------------------------------------------------------------------

    /**
     * Handle direct events (sunrise, sunset, player_death, woke_up).
     * Called from agent.js listeners like:
     *   bot.on('sunrise', () => this.observer?.onEvent('sunrise'));
     *
     * @param {string} eventName
     * @param {object} [data]
     */
    _onDirectEvent(eventName, data = {}) {
        const obs = this.detector.onEvent(eventName, data);
        if (!obs) return;

        if (obs.route === 'immediate') {
            // Bypass queue — fire handleMessage now (fire-and-forget).
            this._expressImmediate(obs);
        } else {
            this._enqueue(obs);
        }
    }

    // ------------------------------------------------------------------
    // Queue injection (called from handleMessage context)
    // ------------------------------------------------------------------

    /**
     * Inject the active observation queue into agent history as a system
     * context message.  Called just before the LLM prompt is assembled,
     * from inside handleMessage (after behavior_log flush).
     *
     * After injection the queue is moved to _archive (V2.1).
     *
     * @returns {boolean}  true if context was injected.
     */
    async injectQueueToHistory() {
        // Track that the player just spoke
        this._lastPlayerMessageTime = Date.now();

        // Expire stale observations
        this._expireStale();

        if (this.active_queue.length === 0) return false;

        // V3: inject boosted prompt before normal context for unconsumed L1/L2 events
        // Calls shouldBoost() (NOT hasReflexTrigger) — narrow check for boost-worthy events
        if (this.autoSpeech.shouldBoost(this.active_queue)) {
            const boostPrompt = this.autoSpeech.buildPrompt(this.active_queue);
            if (boostPrompt) {
                this.agent.history.add('system', boostPrompt);
                // Mark consumed so already-boosted events don't re-boost on next inject
                this.autoSpeech.markConsumed(this.active_queue);
            }
        }

        // Attach mood tags (P1: returns empty array)
        for (const obs of this.active_queue) {
            obs.mood_tags = await this.mood.getMoodTags(obs, this.agent.prompter?.profile);
        }

        // Build context string (includes ALL observations — consumed or not)
        const context = this._formatQueueContext();
        if (context) {
            // [TRACE] Log context injected on player message
            console.log('[TRACE:INJECT_CONTEXT]', JSON.stringify({
                trigger: 'player_message',
                queue_size: this.active_queue.length,
                context: context,
            }));
            this.agent.history.add('system', context);
        }

        // V2.1: move to archive instead of deleting
        this._archive.push(...this.active_queue);
        if (this._archive.length > this._archiveMax) {
            this._archive.splice(0, this._archive.length - this._archiveMax);
        }

        this.active_queue = [];
        return true;
    }

    // ------------------------------------------------------------------
    // Archive access (P2 interface)
    // ------------------------------------------------------------------

    /** @returns {object[]}  Copy of the observation archive. */
    getArchive() {
        return [...this._archive];
    }

    /** @returns {object}  NoveltyTracker serialised state for memory.json. */
    getNoveltyState() {
        return this.novelty.serialise();
    }

    // ------------------------------------------------------------------
    // Internal: enqueue
    // ------------------------------------------------------------------

    _enqueue(obs) {
        // ═══ Persona Attention Filter — discard events the persona doesn't care about ═══
        if (this.agent.persona && !this.agent.persona.shouldAttend(obs)) {
            return;
        }

        // V3: compute attention score and force_expression flag
        this.autoSpeech.computeAttentionScore(obs);

        // [TRACE] Log each enqueued observation with its attention metadata
        console.log('[TRACE:ENQUEUE]', JSON.stringify({
            type: obs.type,
            event_id: obs.event_id,
            attention_score: obs.attention_score,
            force_expression: obs.force_expression,
            consumed: obs.consumed,
            data_snippet: JSON.stringify(obs.data||{}).slice(0,120),
        }));

        // Dedup by event_id within this session
        if (obs.event_id && this._seenEventIds.has(obs.event_id)) return;
        if (obs.event_id) this._seenEventIds.add(obs.event_id);

        // Replace stale same-type observation in queue
        const existingIdx = this.active_queue.findIndex(
            o => o.type === obs.type && o.type !== 'novel_discovery'
        );
        if (existingIdx !== -1) {
            this.active_queue[existingIdx] = obs;
        } else {
            this.active_queue.push(obs);
        }

        // Trim if over max — V3: consumed removed FIRST
        while (this.active_queue.length > this.cfg.queueMaxSize) {
            // V3: prefer consumed, then non-novel_discovery, then oldest
            let idx = this.active_queue.findIndex(o => o.consumed);
            if (idx === -1) idx = this.active_queue.findIndex(o => o.type !== 'novel_discovery');
            if (idx === -1) idx = 0;
            this.active_queue.splice(idx, 1);
        }

        // Notify companion behaviours
        this.companion.notifyObservation(obs);

        // V5: Feed to World State Manager (ground truth)
        this.worldState.factStore.add(obs);

        // ═══ Persona Drift — subtle trait evolution from experience ═══
        this.agent.persona?.drift(obs);
    }

    // ------------------------------------------------------------------
    // Internal: format queue as history context
    // ------------------------------------------------------------------

    _formatQueueContext() {
        const now = Date.now();
        const lines = [];

        for (const obs of this.active_queue) {
            const age = now - obs.timestamp;
            const ageStr = age < 60000
                ? 'just now'
                : `${Math.round(age / 60000)} min ago`;

            let desc = '';
            switch (obs.type) {
                case 'sunrise':
                    desc = `Sunrise over ${obs.data.biome || 'the land'}`;
                    break;
                case 'sunset':
                    desc = `Sunset at ${obs.data.biome || 'the land'}`;
                    break;
                case 'biome_change':
                    desc = `Entered ${obs.data.biome} (from ${obs.data.previous_biome})`;
                    break;
                case 'weather_change':
                    desc = `Weather changed to ${obs.data.weather}`;
                    break;
                case 'novel_discovery':
                    desc = `First time seeing ${obs.data.target} (${obs.data.category})`;
                    break;
                case 'cave_entered':
                    desc = `Entered a cave`;
                    break;
                case 'cave_exited':
                    desc = `Returned to the surface`;
                    break;
                case 'woke_up':
                    desc = `Woke up from sleep`;
                    break;
                case 'periodic':
                    desc = obs.data.summary || 'Taking in the surroundings';
                    break;
                case 'player_joined':
                    desc = `${(obs.data.joined || []).join(', ')} joined`;
                    break;
                case 'player_left':
                    desc = `${(obs.data.left || []).join(', ')} left`;
                    break;
                default:
                    desc = obs.type;
            }

            // Append mood tags if present (P4+)
            const moodStr = obs.mood_tags?.length
                ? ` [mood: ${obs.mood_tags.join(', ')}]`
                : '';

            // V5: tag with fact level and scope annotation
            const tag = this.worldState.realityGuard.formatFactTag(obs);
            const scope = this.worldState.realityGuard.getScopeAnnotation(obs);
            const scopeStr = scope ? ` | ${scope}` : '';
            lines.push(`- ${tag} ${desc} (${ageStr})${scopeStr}${moodStr}`);
        }

        if (lines.length === 0) return null;
        return '[Recent World Observations]\n' + lines.join('\n');
    }

    // ------------------------------------------------------------------
    // Internal: V3 reflex trigger (L1/L2 — immediate, no idle required)
    // ------------------------------------------------------------------

    /**
     * V3 Reflex Layer — immediate speech trigger for high-attention events.
     * Calls hasReflexTrigger() (NOT hasIdleTrigger, NOT shouldBoost).
     * Does NOT require idle time. Only respects: safety guards + cooldown.
     *
     * Called right after poll+enqueue in observer.update().
     */
    _checkReflexTrigger(now) {
        // Safety guards
        if (this.agent.self_prompter?.isActive()) return;
        if (!this.agent.isIdle || !this.agent.isIdle()) return;
        if (this.agent.shut_up) return;

        // Global cooldown (shared across all trigger paths)
        if (now - this._lastProactiveExpression < this.cfg.globalCooldownMs) return;

        // L1/L2 check — force_expression OR ≥0.8 OR threat
        if (!this.autoSpeech.hasReflexTrigger(this.active_queue, this.agent)) return;

        // ═══ Persona Behavior Pipeline — intent + plan before LLM ═══
        // Persona may decide to ignore even high-attention events (e.g. cautious persona)
        if (this.agent.persona) {
            const { intent, plan } = this.agent.persona.generateBehavior(
                { type: 'threat_nearby', attention_score: 0.8 }, { threat: true }
            );
            if (plan.primary_action === 'ignore') return;
            this.agent.persona.setActiveBehavior(intent, plan);
        }

        // Build prompt from unconsumed high-attention observations
        const prompt = this.autoSpeech.buildPrompt(this.active_queue);
        if (!prompt) return;

        // [TRACE] Reflex trigger FIRING
        console.log('[TRACE:REFLEX_FIRE]', JSON.stringify({
            trigger: 'L1/L2 Reflex',
            queue_size: this.active_queue.length,
            queue_items: this.active_queue.map(o => ({type:o.type, score:o.attention_score, consumed:o.consumed, force:o.force_expression})),
            prompt_preview: prompt.slice(0, 300),
        }));

        // Mark consumed BEFORE fire-and-forget (prevents re-trigger in same tick)
        this._lastProactiveExpression = now;
        this.autoSpeech.markConsumed(this.active_queue);

        // Fire-and-forget — handleMessage will call injectQueueToHistory,
        // which calls shouldBoost() (not hasReflexTrigger) → won't double-boost
        this.agent.llmGate.run(
            () => this.agent.handleMessage('system', prompt, 1),
            { throttled: true, dedupKey: this.agent.llmGate.hashKey('reflex', prompt) }
        ).catch(() => {});
    }

    // ------------------------------------------------------------------
    // Internal: V3 idle trigger (L3 — aggregation ≥ 1.2, requires idle)
    // ------------------------------------------------------------------

    /**
     * V3 Idle Speech — fires when idle ≥ 2min AND multiple medium-attention
     * observations accumulate (aggregation ≥ 1.2).
     * Calls hasIdleTrigger() (NOT hasReflexTrigger, NOT shouldBoost).
     */
    _checkAttentionTrigger(now) {
        // Safety guards
        if (this.agent.self_prompter?.isActive()) return;
        if (!this.agent.isIdle || !this.agent.isIdle()) return;
        if (this.agent.shut_up) return;

        // Shared cooldown with reflex + silence
        if (now - this._lastProactiveExpression < this.cfg.globalCooldownMs) return;

        // Idle threshold (2min — vs 5min for silence)
        const idleDuration = now - this._lastPlayerMessageTime;
        if (idleDuration < 120000) return;

        // L3 check — aggregation only (no single-event L1/L2 here)
        if (!this.autoSpeech.hasIdleTrigger(this.active_queue)) return;

        const prompt = this.autoSpeech.buildPrompt(this.active_queue);
        if (!prompt) return;

        // [TRACE] Attention trigger FIRING
        const totalScore = this.autoSpeech._getUsable(this.active_queue)
            .reduce((s,o) => s + (o.attention_score||0), 0);
        console.log('[TRACE:ATTENTION_FIRE]', JSON.stringify({
            trigger: 'L3 Idle Aggregation',
            idle_duration_ms: now - this._lastPlayerMessageTime,
            total_attention: totalScore.toFixed(2),
            queue_items: this.active_queue.map(o => ({type:o.type, score:o.attention_score, consumed:o.consumed})),
            prompt_preview: prompt.slice(0, 300),
        }));

        // ═══ Persona Behavior Pipeline — L3 idle must go through generateBehavior ═══
        if (this.agent.persona) {
            const { intent, plan } = this.agent.persona.generateBehavior(
                { type: 'idle', attention_score: 0.4 }, {}
            );
            if (plan.primary_action === 'ignore') return;
            this.agent.persona.setActiveBehavior(intent, plan);
        }

        this._lastProactiveExpression = now;
        this.autoSpeech.markConsumed(this.active_queue);
        this.agent.llmGate.run(
            () => this.agent.handleMessage('system', prompt, 1),
            { throttled: true }
        ).catch(() => {});
    }

    // ------------------------------------------------------------------
    // Internal: silence-triggered proactive expression
    // ------------------------------------------------------------------

    _checkSilence(now) {
        // Don't speak if self-prompting is active (goal takes priority)
        if (this.agent.self_prompter?.isActive()) return;

        // Don't speak if agent is busy
        if (!this.agent.isIdle || !this.agent.isIdle()) return;

        // Don't speak if in conversation
        // (convoManager is imported at module-level in agent, not directly accessible)
        if (this.agent.shut_up) return;

        // Global cooldown
        if (now - this._lastProactiveExpression < this.cfg.globalCooldownMs) return;

        // Silence threshold
        const silenceDuration = now - this._lastPlayerMessageTime;
        if (silenceDuration < this.cfg.silenceThresholdMs) return;

        // Need at least one observation or fallback to periodic
        this._expireStale();
        if (this.active_queue.length === 0) {
            // Build a lightweight periodic observation for the silence prompt
            const obs = this._buildPeriodicObservation(now);
            if (obs) this._enqueue(obs);
        }

        if (this.active_queue.length === 0) return;

        // Build prompt first — skip if empty (e.g. all observation types dropped)
        const prompt = this._buildSilencePrompt();
        if (!prompt || prompt.trim() === '') return;

        // [TRACE] Silence trigger FIRING
        console.log('[TRACE:SILENCE_FIRE]', JSON.stringify({
            trigger: 'L4 Silence',
            silence_duration_ms: now - this._lastPlayerMessageTime,
            queue_size: this.active_queue.length,
            queue_items: this.active_queue.map(o => ({type:o.type, score:o.attention_score, consumed:o.consumed})),
            prompt_full: prompt,
        }));

        // ═══ Persona Behavior Pipeline — L4 silence must go through generateBehavior ═══
        if (this.agent.persona) {
            const { intent, plan } = this.agent.persona.generateBehavior(
                { type: 'idle', attention_score: 0.3 }, {}
            );
            if (plan.primary_action === 'ignore') return;
            this.agent.persona.setActiveBehavior(intent, plan);
        }

        // Set cooldown and consume events BEFORE firing (prevents re-trigger loop)
        this._lastProactiveExpression = now;
        this.autoSpeech.markConsumed(this.active_queue);

        this.agent.llmGate.run(
            () => this.agent.handleMessage('system', prompt, 1),
            { throttled: true }
        ).catch(() => {});
    }

    _buildSilencePrompt() {
        const now = Date.now();
        const lines = [];

        for (const obs of this.active_queue.slice(0, 3)) {
            const age = Math.round((now - obs.timestamp) / 60000);
            switch (obs.type) {
                case 'sunrise':
                    lines.push(`The sun rose over ${obs.data.biome || 'the land'} about ${age} min ago.`);
                    break;
                case 'sunset':
                    lines.push(`The sun set at ${obs.data.biome || 'the land'} about ${age} min ago.`);
                    break;
                case 'biome_change':
                    lines.push(`You are now in the ${obs.data.biome}.`);
                    break;
                case 'weather_change':
                    lines.push(`The weather turned ${obs.data.weather}.`);
                    break;
                case 'novel_discovery':
                    lines.push(`You saw ${obs.data.target} for the first time.`);
                    break;
                case 'periodic':
                    lines.push(obs.data.summary || '');
                    break;
                default:
                    break;
            }
        }

        const filtered = lines.filter(Boolean);
        if (filtered.length === 0) return '';

        const footer = this.worldState.realityGuard.buildSilenceFooter();
        return (
            '[Observation] ' +
            filtered.join(' ') +
            ' ' + footer
        );
    }

    // ------------------------------------------------------------------
    // Internal: immediate expression (player_death)
    // ------------------------------------------------------------------

    _expressImmediate(obs) {
        // ═══ Persona Behavior Pipeline — death expression must go through generateBehavior ═══
        if (this.agent.persona) {
            const { intent, plan } = this.agent.persona.generateBehavior(
                { type: 'player_death', attention_score: 1.0 }, {}
            );
            this.agent.persona.setActiveBehavior(intent, plan);
        }
        const prompt = `[Urgent] ${obs.data.player || 'Someone'} has died${obs.data.message ? ': ' + obs.data.message : ''}. Respond with empathy.`;
        // Fire-and-forget (interactive — no throttle)
        this.agent.llmGate.run(
            () => this.agent.handleMessage('system', prompt, 1)
        ).catch(() => {});
    }

    // ------------------------------------------------------------------
    // Internal: periodic observation builder
    // ------------------------------------------------------------------

    _buildPeriodicObservation(now) {
        const snapshot = this.agent.vision_perception?.getLatest();
        if (!snapshot || !snapshot.labels || snapshot.labels.length === 0) return null;

        const summary = `It's a quiet ${snapshot.labels.slice(0, 4).join(', ')}. ` +
            `Weather is ${snapshot.raw?.weather || 'Clear'}.`;

        return {
            type: 'periodic',
            route: 'queue',
            data: {
                summary,
                labels: snapshot.labels,
                weather: snapshot.raw?.weather,
                biome: snapshot.raw?.biome,
            },
            timestamp: now,
            event_id: `periodic_${new Date(now).toISOString().slice(0, 13)}`,
        };
    }

    // ------------------------------------------------------------------
    // Internal: helpers
    // ------------------------------------------------------------------

    _expireStale() {
        const now = Date.now();
        this.active_queue = this.active_queue.filter(
            obs => now - obs.timestamp < this.cfg.queueMaxAgeMs
        );
    }
}
