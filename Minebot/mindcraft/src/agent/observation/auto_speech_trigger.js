/**
 * AutoSpeechTrigger — attention-driven expression trigger for V3.
 *
 * Computes attention_score for every observation and provides three
 * purpose-specific trigger checks so each Observer path calls its
 * OWN method (hard isolation — no cross-calling):
 *
 *   _checkReflexTrigger   → hasReflexTrigger()   L1/L2 single-event
 *   _checkAttentionTrigger → hasIdleTrigger()     L3 aggregation
 *   injectQueueToHistory   → shouldBoost()        boost inject
 *
 * All three filter out consumed observations so the same event
 * never triggers twice.
 *
 * Does NOT call LLM.  Does NOT query the world (except _checkThreatContext
 * which reads already-stamped bot fields).
 */

import * as world from '../library/world.js';
import * as mc from '../../utils/mcdata.js';

// ---------------------------------------------------------------------------
// Hostile entity labels — matched case-insensitively against VisionPerception
// label strings to apply the danger boost.
// ---------------------------------------------------------------------------
const HOSTILE_LABELS = new Set([
    'zombie', 'skeleton', 'creeper', 'spider', 'cave_spider',
    'enderman', 'witch', 'warden', 'blaze', 'ghast',
    'piglin', 'piglin_brute', 'hoglin', 'phantom', 'drowned',
    'stray', 'husk', 'vindicator', 'pillager', 'evoker',
    'ravager', 'guardian', 'elder_guardian', 'slime', 'magma_cube',
    'silverfish', 'endermite', 'vex', 'zoglin', 'wither_skeleton',
]);

// ---------------------------------------------------------------------------
// Attention scoring table — maps observation type to base attention_score.
// ---------------------------------------------------------------------------
const BASE_ATTENTION = {
    player_death:     1.0,
    novel_discovery:  null,   // computed dynamically from data.significance + data.familiarity
    cave_entered:     0.65,
    weather_change:   null,   // depends on weather string
    biome_change:     0.55,
    sunset:           0.5,
    sunrise:          0.45,
    cave_exited:      0.45,
    player_joined:    0.4,
    woke_up:          0.35,
    player_left:      0.3,
    periodic:         0.25,
};

// Weather-specific attention
const WEATHER_ATTENTION = {
    Thunderstorm: 0.6,
    Rain:         0.5,
    Clear:        0.3,
};

// Familiarity multiplier for novel_discovery
const FAMILIARITY_ATTENTION = {
    first_time:  { high_sig: 0.8,  normal: 0.65 },
    unfamiliar:  { high_sig: 0.5,  normal: 0.5  },
    familiar:    { high_sig: 0.35, normal: 0.35 },
    well_known:  { high_sig: 0.25, normal: 0.25 },
};

// Force expression threshold
const FORCE_EXPRESSION_THRESHOLD = 0.85;

// ---------------------------------------------------------------------------
// AutoSpeechTrigger
// ---------------------------------------------------------------------------
export class AutoSpeechTrigger {
    constructor() {
        // Stateless — all methods are pure or read pre-stamped bot fields.
    }

    // ------------------------------------------------------------------
    // computeAttentionScore(obs)
    // ------------------------------------------------------------------

    /**
     * Attach attention_score and force_expression to the observation.
     * Called from Observer._enqueue() for every observation.
     *
     * @param {object} obs  The observation (mutated in place).
     * @returns {object}    The same observation, for chaining.
     */
    computeAttentionScore(obs) {
        let score = 0;

        switch (obs.type) {
            case 'player_death':
                score = BASE_ATTENTION.player_death;
                break;

            case 'novel_discovery': {
                const sig = obs.data?.significance ?? 0.5;
                const fam = obs.data?.familiarity || 'first_time';
                const bucket = sig >= 0.7 ? 'high_sig' : 'normal';
                const map = FAMILIARITY_ATTENTION[fam] || FAMILIARITY_ATTENTION.first_time;
                score = map[bucket] || 0.5;
                break;
            }

            case 'weather_change': {
                const weather = obs.data?.weather || 'Clear';
                score = WEATHER_ATTENTION[weather] ?? 0.3;
                break;
            }

            case 'cave_entered':
                score = BASE_ATTENTION.cave_entered;
                break;

            case 'cave_exited':
                score = BASE_ATTENTION.cave_exited;
                break;

            case 'biome_change':
                score = BASE_ATTENTION.biome_change;
                break;

            case 'sunrise':
                score = BASE_ATTENTION.sunrise;
                break;

            case 'sunset':
                score = BASE_ATTENTION.sunset;
                break;

            case 'player_joined':
                score = BASE_ATTENTION.player_joined;
                break;

            case 'player_left':
                score = BASE_ATTENTION.player_left;
                break;

            case 'woke_up':
                score = BASE_ATTENTION.woke_up;
                break;

            case 'periodic':
                score = BASE_ATTENTION.periodic;
                break;

            default:
                score = 0.2;
                break;
        }

        // Danger boost — if labels contain hostile entities
        const labels = obs.data?.labels || [];
        if (labels.length > 0) {
            const hasHostile = labels.some(
                l => HOSTILE_LABELS.has(String(l).toLowerCase().replace(/\s+/g, '_'))
            );
            if (hasHostile) {
                score = Math.max(score, 0.8);
            }
        }

        // Clamp
        obs.attention_score = Math.min(1.0, Math.max(0, score));
        obs.force_expression = obs.attention_score >= FORCE_EXPRESSION_THRESHOLD;

        return obs;
    }

    // ------------------------------------------------------------------
    // Trigger checks (split by caller — hard isolation)
    // ------------------------------------------------------------------

    /** @returns {object[]}  unconsumed observations only. */
    _getUsable(observations) {
        if (!observations || observations.length === 0) return [];
        return observations.filter(o => !o.consumed);
    }

    /**
     * L1/L2 Reflex check — called ONLY from _checkReflexTrigger.
     * Single high-attention event OR threat context.
     * Does NOT require idle time.
     *
     * @param {object[]} observations  The active_queue.
     * @param {object}   [agent]       Agent reference (for threat check).
     * @returns {boolean}
     */
    hasReflexTrigger(observations, agent) {
        const usable = this._getUsable(observations);
        if (usable.length === 0) return false;

        // L1: force_expression
        if (usable.some(o => o.force_expression)) return true;

        // L2: single high-attention event (≥ 0.8)
        if (usable.some(o => (o.attention_score || 0) >= 0.8)) return true;

        // Threat context (damage < 15s or hostile mob < 8m)
        if (agent && this._checkThreatContext(agent)) return true;

        return false;
    }

    /**
     * L3 Idle check — called ONLY from _checkAttentionTrigger.
     * Aggregation threshold (idle ≥ 2min checked by caller).
     *
     * @param {object[]} observations  The active_queue.
     * @returns {boolean}
     */
    hasIdleTrigger(observations) {
        const usable = this._getUsable(observations);
        if (usable.length === 0) return false;

        const total = usable.reduce((sum, o) => sum + (o.attention_score || 0), 0);
        return total >= 1.2;
    }

    /**
     * Boost check — called ONLY from injectQueueToHistory.
     * Returns true when unconsumed L1/L2 events should be boosted
     * as a leading system message before the normal context injection.
     *
     * @param {object[]} observations  The active_queue.
     * @returns {boolean}
     */
    shouldBoost(observations) {
        const usable = this._getUsable(observations);
        if (usable.length === 0) return false;
        return usable.some(
            o => o.force_expression || (o.attention_score || 0) >= 0.8
        );
    }

    // ------------------------------------------------------------------
    // markConsumed
    // ------------------------------------------------------------------

    /**
     * Mark all observations as consumed so they won't re-trigger.
     * Called AFTER a trigger fires, BEFORE handleMessage.
     *
     * @param {object[]} observations
     */
    markConsumed(observations) {
        for (const obs of observations) {
            obs.consumed = true;
        }
    }

    // ------------------------------------------------------------------
    // buildPrompt
    // ------------------------------------------------------------------

    /**
     * Build a boosted prompt from unconsumed high-attention observations.
     * Only includes observations with attention_score > 0.5.
     *
     * @param {object[]} observations  The active_queue.
     * @returns {string|null}
     */
    buildPrompt(observations) {
        const usable = observations.filter(
            o => !o.consumed && (o.attention_score || 0) > 0.5
        );
        if (usable.length === 0) return null;

        const lines = [];
        const now = Date.now();

        for (const obs of usable) {
            const desc = this._describeObservation(obs, now);
            if (desc) lines.push(`- ${desc}`);
        }

        if (lines.length === 0) return null;

        return (
            '[IMPORTANT EVENTS — These deserve your attention]\n' +
            lines.join('\n') +
            '\n\nYou may respond to these events even if the player does not speak. ' +
            'React naturally — express curiosity about new discoveries, ' +
            'caution about danger, or appreciation for beautiful moments.'
        );
    }

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------

    /**
     * Produce a human-readable description of an observation.
     */
    _describeObservation(obs, now) {
        const age = now - obs.timestamp;
        const ageStr = age < 60000
            ? 'just now'
            : `${Math.round(age / 60000)} min ago`;

        switch (obs.type) {
            case 'player_death':
                return `${obs.data?.player || 'Someone'} has died (${ageStr})`;
            case 'novel_discovery':
                return `First time seeing ${obs.data?.target} (${obs.data?.category}) — ${ageStr}`;
            case 'cave_entered':
                return `Entered a dark cave (${ageStr})`;
            case 'weather_change':
                return `Weather turned to ${obs.data?.weather} (${ageStr})`;
            case 'biome_change':
                return `Entered ${obs.data?.biome} (${ageStr})`;
            case 'sunrise':
                return `Sunrise over ${obs.data?.biome || 'the land'} (${ageStr})`;
            case 'sunset':
                return `Sunset at ${obs.data?.biome || 'the land'} (${ageStr})`;
            case 'cave_exited':
                return `Returned to the surface (${ageStr})`;
            case 'player_joined':
                return `${(obs.data?.joined || []).join(', ')} joined (${ageStr})`;
            case 'player_left':
                return `${(obs.data?.left || []).join(', ')} left (${ageStr})`;
            case 'woke_up':
                return `Woke up from sleep (${ageStr})`;
            case 'periodic':
                return obs.data?.summary || 'Taking in the surroundings';
            default:
                return obs.type;
        }
    }

    // ------------------------------------------------------------------
    // _checkThreatContext
    // ------------------------------------------------------------------

    /**
     * Check whether the agent is currently in immediate danger.
     * Called ONLY by hasReflexTrigger (L1/L2 path).
     *
     * Reads pre-stamped bot properties — no world queries except
     * getNearestEntityWhere (which is a fast mineflayer entity scan
     * limited to 8m radius).
     *
     * @param {object} agent
     * @returns {boolean}
     */
    _checkThreatContext(agent) {
        const bot = agent.bot;
        if (!bot || !bot.entity) return false;

        // Recent damage (< 15 seconds)
        if (bot.lastDamageTime && Date.now() - bot.lastDamageTime < 15000) {
            return true;
        }

        // Nearby hostile entity within 8 blocks
        try {
            const nearbyHostile = world.getNearestEntityWhere(
                bot, e => mc.isHostile(e), 8
            );
            if (nearbyHostile) return true;
        } catch (_) { /* world query can fail; non-critical */ }

        return false;
    }
}
