/**
 * World State Manager — V5 ground-truth state layer.
 *
 * Serves as the SINGLE SOURCE OF TRUTH between the Observer and the LLM.
 * The LLM is positioned as an INTERPRETER (not an actor) — it can express
 * feelings and describe observations, but CANNOT fabricate actions or events.
 *
 * Architecture:
 *
 *   Observer ──write──→ FactStore ──read──→ RealityGuard ──→ $REALITY_RULES
 *   Commands ──write──→ ActionLog ──read──→ RealityGuard ──→ $ACTION_LOG
 *   LLM output ──NEVER WRITES TO EITHER──→ Speech only
 *
 * Three-Layer Truth Model:
 *   Layer 1: FactStore  — what the bot ACTUALLY perceived (Observer writes)
 *   Layer 2: ActionLog  — what the bot ACTUALLY did (commands write)
 *   Layer 3: Speech     — what the bot SAID (LLM generates, zero weight)
 *
 * Does NOT call LLM. Does NOT modify Observer core logic.
 * Pure data structures + string formatting. Zero runtime overhead.
 */

// ---------------------------------------------------------------------------
// Fact Store — ground-truth observations (Observer writes ONLY)
// ---------------------------------------------------------------------------

const FACT_STORE_DEFAULTS = {
    maxEntries: 50,
};

/** Per-observation-type scope: what is KNOWN vs UNKNOWN. */
const OBSERVATION_SCOPE = {
    sunrise: {
        known:   ['The sun has risen', 'It is now daytime'],
        unknown: ['What the weather will be', 'What events will occur today'],
    },
    sunset: {
        known:   ['The sun has set', 'It is now night'],
        unknown: ['Whether monsters have spawned', 'Where monsters are', 'How many monsters exist'],
    },
    player_death: {
        known:   ['Someone has died', 'You know this from the chat message'],
        unknown: ['How they died', 'Where they died', 'Who or what killed them', 'What they lost'],
    },
    woke_up: {
        known:   ['You have woken up from sleep', 'It is morning'],
        unknown: ['What happened while you slept', 'Whether anything changed overnight'],
    },
    biome_change: {
        known:   ['You have entered a new biome', 'The terrain and vegetation have changed'],
        unknown: ['What structures exist here', 'What resources are available', 'What entities are present'],
    },
    weather_change: {
        known:   ['The weather has changed'],
        unknown: ['How long it will last', 'Whether it will change again soon'],
    },
    cave_entered: {
        known:   ['You are in a dark enclosed space', 'Sky light level is near zero'],
        unknown: ['What is inside the cave', 'Whether monsters are present',
                  'What resources exist', 'How deep the cave goes',
                  'Whether there are lava pools or drops'],
    },
    cave_exited: {
        known:   ['You have returned to the surface', 'You are no longer underground'],
        unknown: ['What changed on the surface while you were underground'],
    },
    player_joined: {
        known:   ['A player has joined the game', 'You know their username'],
        unknown: ['Where they are', 'What they intend to do', 'Whether they will interact with you'],
    },
    player_left: {
        known:   ['A player has left the game'],
        unknown: ['Why they left', 'Whether they will return'],
    },
    novel_discovery: {
        known:   ['You are seeing this for the first time',
                  'It is currently in your field of view'],
        unknown: ['Its behavior', 'Whether it is dangerous or friendly',
                  'What it will do next', 'Its properties'],
    },
    periodic: {
        known:   ['This is a periodic snapshot of your surroundings at one moment in time',
                  'The information may be stale'],
        unknown: ['What has changed since this snapshot',
                  'Whether the listed entities are still nearby'],
    },
};

export class FactStore {
    constructor(config = {}) {
        this.cfg = { ...FACT_STORE_DEFAULTS, ...config };
        /** @type {object[]} */
        this._facts = [];
    }

    /**
     * Add an observation to the store. Called ONLY by Observer._enqueue().
     * Annotates with scope (KNOWN/UNKNOWN) at write time.
     *
     * @param {object} obs  The observation from EventDetector.
     */
    add(obs) {
        // Attach scope annotation
        const scope = OBSERVATION_SCOPE[obs.type];
        if (scope) {
            obs._scope = scope;
        }

        this._facts.push(obs);
        this._trim();
    }

    /**
     * Get recent facts within a time window.
     * @param {number} minutes  Lookback window in minutes.
     * @returns {object[]}
     */
    getRecent(minutes = 5) {
        const cutoff = Date.now() - minutes * 60 * 1000;
        return this._facts.filter(f => f.timestamp >= cutoff);
    }

    /**
     * Get facts by observation type.
     * @param {string} type
     * @returns {object[]}
     */
    getByType(type) {
        return this._facts.filter(f => f.type === type);
    }

    /**
     * @returns {number}  Total facts stored.
     */
    get count() {
        return this._facts.length;
    }

    /**
     * Format the active queue for LLM context injection.
     * Each observation is tagged with its fact level and scope annotation.
     *
     * @param {object[]} queue  The active_queue (unconsumed observations).
     * @returns {string|null}
     */
    formatQueueWithScope(queue) {
        if (!queue || queue.length === 0) return null;

        const now = Date.now();
        const lines = [];

        for (const obs of queue) {
            const age = now - obs.timestamp;
            const ageStr = age < 60000
                ? 'just now'
                : `${Math.round(age / 60000)} min ago`;

            const desc = this._describeObservation(obs);
            const tag = this._formatFactTag(obs);
            const scope = this._formatScope(obs);

            lines.push(`- ${tag} ${desc} (${ageStr}) | ${scope}`);
        }

        return '[Recent World Observations]\n' + lines.join('\n');
    }

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------

    _trim() {
        while (this._facts.length > this.cfg.maxEntries) {
            this._facts.shift();
        }
    }

    /** @returns {'[OBSERVED]' | '[AMBIENT]'} */
    _formatFactTag(obs) {
        if (obs.type === 'periodic') return '[AMBIENT]';
        return '[OBSERVED]';
    }

    /** Format the scope annotation for a single observation. */
    _formatScope(obs) {
        const scope = obs._scope;
        if (!scope) return '';

        const known = scope.known?.length
            ? `Known: ${scope.known.join('. ')}.`
            : '';
        const unknown = scope.unknown?.length
            ? `Unknown: ${scope.unknown.join('. ')}.`
            : '';

        return [known, unknown].filter(Boolean).join(' ');
    }

    /** Produce a short human-readable description for an observation. */
    _describeObservation(obs) {
        switch (obs.type) {
            case 'sunrise':
                return `Sunrise over ${obs.data?.biome || 'the land'}`;
            case 'sunset':
                return `Sunset at ${obs.data?.biome || 'the land'}`;
            case 'biome_change':
                return `Entered ${obs.data?.biome} (from ${obs.data?.previous_biome || 'unknown'})`;
            case 'weather_change':
                return `Weather changed to ${obs.data?.weather || 'unknown'}`;
            case 'novel_discovery':
                return `First time seeing ${obs.data?.target || 'something'} (${obs.data?.category || 'unknown'})`;
            case 'cave_entered':
                return `Entered a dark cave`;
            case 'cave_exited':
                return `Returned to the surface`;
            case 'woke_up':
                return `Woke up from sleep`;
            case 'periodic':
                return obs.data?.summary || 'Taking in the surroundings';
            case 'player_joined':
                return `${(obs.data?.joined || []).join(', ') || 'Someone'} joined the game`;
            case 'player_left':
                return `${(obs.data?.left || []).join(', ') || 'Someone'} left the game`;
            case 'player_death':
                return `${obs.data?.player || 'Someone'} has died`;
            default:
                return obs.type || 'Unknown observation';
        }
    }
}

// ---------------------------------------------------------------------------
// Action Log — executed command registry (command system writes ONLY)
// ---------------------------------------------------------------------------

const ACTION_LOG_DEFAULTS = {
    maxEntries: 20,
};

export class ActionLog {
    constructor(config = {}) {
        this.cfg = { ...ACTION_LOG_DEFAULTS, ...config };
        /** @type {object[]} */
        this._actions = [];
    }

    /**
     * Record a command execution. Called ONLY from executeCommand().
     *
     * @param {string} command  e.g. "!goToPlayer"
     * @param {string[]} args   e.g. ["Steve", "2"]
     * @param {string|object} [result]  Command result (string message, or object).
     */
    record(command, args = [], result = null) {
        const entry = {
            command,
            args,
            timestamp: Date.now(),
            result: result != null ? 'success' : 'completed',
            resultDetail: typeof result === 'string' ? result : '',
            summary: this._summarize(command, args, result),
        };
        this._actions.push(entry);
        this._trim();
    }

    /**
     * Get the most recent N actions.
     * @param {number} count
     * @returns {object[]}
     */
    getRecent(count = 5) {
        return this._actions.slice(-count);
    }

    /**
     * @returns {boolean}  True if no actions have been recorded.
     */
    isEmpty() {
        return this._actions.length === 0;
    }

    /**
     * @returns {number}  Total actions recorded.
     */
    get count() {
        return this._actions.length;
    }

    /**
     * Format recent actions for LLM prompt injection ($ACTION_LOG placeholder).
     * This is the EVIDENTIARY FOUNDATION — the LLM sees exactly what it has
     * actually done and cannot claim otherwise.
     *
     * @param {number} count  Number of recent actions to show.
     * @returns {string}
     */
    formatForPrompt(count = 5) {
        if (this._actions.length === 0) {
            return 'You have NOT performed any actions yet.';
        }

        const recent = this._actions.slice(-count);
        const lines = ['Actions you have ACTUALLY performed (via !commands):'];

        for (const a of recent) {
            lines.push(`  ${a.summary}`);
        }

        lines.push('You have NOT performed any other actions.');
        return lines.join('\n');
    }

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------

    _trim() {
        while (this._actions.length > this.cfg.maxEntries) {
            this._actions.shift();
        }
    }

    /**
     * Produce a human-readable summary of a command execution.
     * e.g. "!goToPlayer(Steve, 2) — reached player"
     */
    _summarize(command, args, result) {
        const argsStr = args.length > 0
            ? `(${args.map(a => typeof a === 'string' ? `"${a}"` : a).join(', ')})`
            : '';

        let outcome = '';
        if (result != null) {
            if (typeof result === 'string' && result.length > 0) {
                // Truncate long result strings
                outcome = result.length > 80
                    ? result.slice(0, 77) + '...'
                    : result;
            } else if (typeof result === 'object') {
                outcome = 'completed';
            } else {
                outcome = 'executed';
            }
        } else {
            outcome = 'executed';
        }

        return `${command}${argsStr} — ${outcome}`;
    }
}

// ---------------------------------------------------------------------------
// RealityGuard — V4 prompt-generation sub-module (reads FactStore + ActionLog)
// ---------------------------------------------------------------------------

/**
 * Fact classification for each observation type.
 * HARD_FACT  = directly detected state change (Observer confirmed).
 * SOFT_SIGNAL = periodic ambient snapshot (may be stale, less precise).
 */
const FACT_LEVEL = {
    sunrise:         'HARD_FACT',
    sunset:          'HARD_FACT',
    player_death:    'HARD_FACT',
    biome_change:    'HARD_FACT',
    weather_change:  'HARD_FACT',
    cave_entered:    'HARD_FACT',
    cave_exited:     'HARD_FACT',
    woke_up:         'HARD_FACT',
    player_joined:   'HARD_FACT',
    player_left:     'HARD_FACT',
    novel_discovery: 'HARD_FACT',
    periodic:        'SOFT_SIGNAL',
};

/** Fact classification display tags. */
const FACT_TAGS = {
    HARD_FACT:   '[OBSERVED]',
    SOFT_SIGNAL: '[AMBIENT]',
};

// ---------------------------------------------------------------------------
// REALITY RULES — injected into system prompt via $REALITY_RULES
// ---------------------------------------------------------------------------

const REALITY_RULES_TEMPLATE = `[REALITY ANCHOR — CRITICAL RULES]

You are an AI companion in Minecraft. You perceive the world through
observations and express feelings. You are NOT the actor — !commands
are the only real actions. Your words are speech ONLY.

$ACTION_LOG_PLACEHOLDER

ALLOWED (you may freely express these):
- Your emotional reactions and feelings ("I feel nervous...", "This place is beautiful!")
- Sensory impressions ("It's so dark in here...", "I hear something...")
- Reasonable inferences marked with uncertainty ("maybe", "might", "perhaps", "I think")
- Questions and suggestions for the player ("Should we light some torches?")
- References to your actual memory (prefixed with "I remember...")
- Expressing intent to act via !command syntax

FORBIDDEN (you MUST NEVER claim or imply these):
- Performing actions you haven't taken (hitting, mining, placing, equipping, etc.)
  → ONLY actions listed in the Action Log above actually happened
- Narrating what the player is doing, thinking, or feeling
  → The player's actions and internal state are their own
- Describing events that haven't been observed
  → "Entered cave" means you ARE in a cave — it does NOT mean you know what's inside
- Claiming outcomes that haven't occurred
  → Say "let's explore" not "we found diamonds"
- Inventing past experiences not in your memory
  → If you don't remember it, it didn't happen

GUIDELINE:
When in doubt, express uncertainty rather than certainty.
If you want to act, use !command syntax to actually perform the action.
Your role is COMPANION, not narrator of a story.`;

// ---------------------------------------------------------------------------
// RealityGuard class
// ---------------------------------------------------------------------------

export class RealityGuard {
    constructor() {
        // Stateless — all methods read from parameters, not internal state.
    }

    /**
     * Build the full $REALITY_RULES prompt block.
     * Injects the current Action Log as concrete evidence.
     *
     * @param {ActionLog} actionLog
     * @returns {string}
     */
    buildGuardPrompt(actionLog) {
        const actionText = actionLog
            ? actionLog.formatForPrompt(5)
            : 'You have NOT performed any actions yet.';

        return REALITY_RULES_TEMPLATE.replace('$ACTION_LOG_PLACEHOLDER', actionText);
    }

    /**
     * Build a per-turn reality context block.
     * Injected before each LLM response to ground the current turn.
     *
     * @param {object[]} queue        The active observation queue.
     * @param {ActionLog} actionLog
     * @returns {string}
     */
    buildRealityContext(queue, actionLog) {
        const actionCount = actionLog ? actionLog.count : 0;
        const obsCount = queue ? queue.length : 0;

        let ctx = '[REALITY CHECK — Before you respond]\n';
        ctx += `You have performed ${actionCount} actions this session.\n`;

        if (actionCount === 0) {
            ctx += 'You have NOT drawn weapons, mined blocks, placed items, or moved to any location.\n';
        }

        ctx += `You have ${obsCount} recent observations to draw from.\n`;
        ctx += 'Your response is SPEECH ONLY. It does NOT execute anything.\n';
        ctx += 'To act, use !command syntax. Otherwise, describe what you notice and how you feel.\n';
        ctx += 'Do NOT fabricate actions. Do NOT narrate events that have not been observed.';

        return ctx;
    }

    /**
     * Build the footer appended to auto-speech prompts (L1-L4).
     * Shorter and more directive than the full system prompt rules.
     *
     * @returns {string}
     */
    buildSpeechFooter() {
        return '[REALITY CHECK]\n' +
            'You have NOT done anything yet — these are OBSERVATIONS, not actions.\n' +
            'Describe what you NOTICE and how you FEEL.\n' +
            'Do NOT invent actions, combat, mining, or events that did not happen.\n' +
            'If you want to act, suggest it or use a !command.';
    }

    /**
     * Shorter footer for silence prompts (L4).
     * @returns {string}
     */
    buildSilenceFooter() {
        return '(Describe how you feel, not what you are doing. Do not invent actions.)';
    }

    /**
     * Classify an observation as HARD_FACT or SOFT_SIGNAL.
     * @param {object} obs
     * @returns {'HARD_FACT' | 'SOFT_SIGNAL'}
     */
    classifyFactLevel(obs) {
        return FACT_LEVEL[obs.type] || 'SOFT_SIGNAL';
    }

    /**
     * Get the display tag for an observation's fact level.
     * @param {object} obs
     * @returns {string}
     */
    formatFactTag(obs) {
        const level = this.classifyFactLevel(obs);
        return FACT_TAGS[level] || '';
    }

    /**
     * Get the scope annotation (KNOWN/UNKNOWN) for an observation type.
     * @param {object} obs
     * @returns {string}
     */
    getScopeAnnotation(obs) {
        const scope = OBSERVATION_SCOPE[obs.type];
        if (!scope) return '';

        const parts = [];
        if (scope.known?.length) {
            parts.push(`Known: ${scope.known.join('. ')}.`);
        }
        if (scope.unknown?.length) {
            parts.push(`Unknown: ${scope.unknown.join('. ')}.`);
        }
        return parts.join(' ');
    }
}

// ---------------------------------------------------------------------------
// World State Manager — top-level orchestrator
// ---------------------------------------------------------------------------

export class WorldStateManager {
    constructor(config = {}) {
        this.factStore = new FactStore(config.factStore || {});
        this.actionLog = new ActionLog(config.actionLog || {});
        this.realityGuard = new RealityGuard();
    }

    /**
     * Build the complete reality context for injection into the LLM prompt.
     * Called from Prompter.replaceStrings() for $REALITY_RULES and $ACTION_LOG.
     *
     * @returns {{ rules: string, actionLog: string }}
     */
    buildPromptContext() {
        return {
            rules: this.realityGuard.buildGuardPrompt(this.actionLog),
            actionLog: this.actionLog.formatForPrompt(5),
        };
    }
}
