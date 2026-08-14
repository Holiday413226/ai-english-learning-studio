/**
 * EventDetector — detects meaningful world changes and produces
 * standardised Observation objects.
 *
 * Two detection strategies:
 *   A. Direct events — sunrise, sunset, player death, woke up.
 *      These are pushed via onEvent() from agent.js event listeners.
 *   B. State-change polling — biome, weather, skyLight (cave),
 *      isSleeping, player list.  Compared against cached previous
 *      values on each tick.
 *
 * Integrates with NoveltyTracker to emit novel_discovery observations
 * when the agent encounters something for the first time.
 *
 * Does NOT call LLM.  Does NOT interact with history or chat.
 */

import * as world from '../library/world.js';
import { NoveltyTracker } from './novelty_tracker.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_TICKS = 24000;

/** Stable day-number from timeOfDay so sunrise/sunset IDs persist across
 *  the same Minecraft day even if the exact tick drifts. */
function dayNumber(timeOfDay) {
    // Minecraft day length is 24000 ticks.
    // We don't have absolute day count, so use timeOfDay window.
    // Sunrise = 0, Sunset = 12000.  Same-day events share the same
    // "day" identifier derived from the last sunrise boundary.
    if (typeof timeOfDay !== 'number') return 'unknown';
    // Round to nearest 24000-tick boundary
    // Actually, we don't have epoch.  Use floor division as proxy.
    // This works because Minecraft time always increases.
    // For event_id we'll use date-based IDs from JS timestamps instead.
    return null; // handled via JS Date in onEvent
}

/** Stable weather string from rain/thunder state. */
function weatherString(bot) {
    if (bot.thunderState > 0) return 'Thunderstorm';
    if (bot.rainState > 0)    return 'Rain';
    return 'Clear';
}

/** Stable player list snapshot. */
function playerList(bot) {
    try {
        return Object.keys(bot.players || {}).sort().join(',');
    } catch (_) {
        return '';
    }
}

// ---------------------------------------------------------------------------
// EventDetector
// ---------------------------------------------------------------------------
export class EventDetector {
    /**
     * @param {object} agent  The Agent instance.
     * @param {NoveltyTracker} noveltyTracker
     * @param {object} [config]
     */
    constructor(agent, noveltyTracker, config = {}) {
        this.agent = agent;
        this.bot = agent.bot;
        this.novelty = noveltyTracker;

        // State cache — initialised on first tick
        this._prevBiome = null;
        this._prevWeather = null;
        this._prevSkyLight = null;
        this._prevIsSleeping = null;
        this._prevPlayers = null;
        this._initialised = false;

        // Config
        this._scanIntervalMs = config.scanIntervalMs ?? 2000;

        // Internal tick throttle
        this._lastScan = 0;
    }

    // ------------------------------------------------------------------
    // Public: direct event injection (called from agent.js listeners)
    // ------------------------------------------------------------------

    /**
     * Handle a named direct event.
     * @param {'sunrise'|'sunset'|'player_death'|'woke_up'} eventName
     * @param {object} [data]  Extra event data.
     * @returns {object|null}  Observation or null if suppressed.
     */
    onEvent(eventName, data = {}) {
        const now = Date.now();
        const today = new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD

        switch (eventName) {
            case 'sunrise': {
                const snapshot = this.agent.vision_perception?.getLatest();
                return {
                    type: 'sunrise',
                    route: 'queue',
                    data: {
                        biome: snapshot?.raw?.biome || this._prevBiome,
                        weather: this._prevWeather,
                        labels: snapshot?.labels || [],
                    },
                    timestamp: now,
                    event_id: `sunrise_${today}`,
                };
            }

            case 'sunset': {
                const snapshot = this.agent.vision_perception?.getLatest();
                return {
                    type: 'sunset',
                    route: 'queue',
                    data: {
                        biome: snapshot?.raw?.biome || this._prevBiome,
                        weather: this._prevWeather,
                        labels: snapshot?.labels || [],
                    },
                    timestamp: now,
                    event_id: `sunset_${today}`,
                };
            }

            case 'player_death': {
                return {
                    type: 'player_death',
                    route: 'immediate',
                    data: {
                        player: data.player || 'a player',
                        message: data.message || '',
                        position: data.position || null,
                    },
                    timestamp: now,
                    event_id: `player_death_${now}`,
                };
            }

            case 'woke_up': {
                const snapshot = this.agent.vision_perception?.getLatest();
                return {
                    type: 'woke_up',
                    route: 'queue',
                    data: {
                        biome: snapshot?.raw?.biome || this._prevBiome,
                        weather: this._prevWeather,
                        labels: snapshot?.labels || [],
                    },
                    timestamp: now,
                    event_id: `woke_up_${today}`,
                };
            }

            default:
                return null;
        }
    }

    // ------------------------------------------------------------------
    // Public: state-change polling (called from observer.update)
    // ------------------------------------------------------------------

    /**
     * Poll for state changes.  Throttled internally.
     * @param {number} delta  ms since last agent.update().
     * @returns {object[]}  Array of new Observations (may be empty).
     */
    poll(delta) {
        this._lastScan += delta;
        if (this._lastScan < this._scanIntervalMs) return [];
        this._lastScan = 0;

        const observations = [];
        const now = Date.now();
        const bot = this.bot;
        if (!bot || !bot.entity) return [];

        // [TRACE] Log Minecraft real state at each scan
        try {
            const pos = world.getPosition(bot);
            const snapshot = this.agent.vision_perception?.getLatest();
            console.log('[TRACE:MC_STATE]', JSON.stringify({
                biome: this._prevBiome,
                weather: this._prevWeather,
                skyLight: this._prevSkyLight,
                pos: pos ? {x:Number(pos.x.toFixed(1)),y:Number(pos.y.toFixed(1)),z:Number(pos.z.toFixed(1))} : null,
                timeOfDay: bot.time?.timeOfDay,
                health: bot.health,
                labels: snapshot?.labels?.slice(0,8) || [],
                entities: snapshot?.raw?.entities?.slice(0,5) || [],
            }));
        } catch(e) { /* trace only */ }

        // --- Biome change ---
        try {
            const biome = world.getBiomeName(bot);
            if (this._initialised && biome && biome !== this._prevBiome) {
                const snapshot = this.agent.vision_perception?.getLatest();
                observations.push({
                    type: 'biome_change',
                    route: 'queue',
                    data: {
                        previous_biome: this._prevBiome,
                        biome,
                        labels: snapshot?.labels || [],
                    },
                    timestamp: now,
                    event_id: `biome_change_${this._prevBiome}_to_${biome}_${now}`,
                });
            }
            this._prevBiome = biome;
        } catch (_) { /* ignore */ }

        // --- Weather change ---
        try {
            const weather = weatherString(bot);
            if (this._initialised && weather !== this._prevWeather) {
                observations.push({
                    type: 'weather_change',
                    route: 'queue',
                    data: {
                        previous_weather: this._prevWeather,
                        weather,
                    },
                    timestamp: now,
                    event_id: `weather_${weather}_${new Date(now).toISOString().slice(0, 13)}`,
                });
            }
            this._prevWeather = weather;
        } catch (_) { /* ignore */ }

        // --- Cave entered / exited (skyLight transition) ---
        try {
            const pos = world.getPosition(bot);
            const feetBlock = bot.blockAt(pos);
            const skyLight = feetBlock ? feetBlock.skyLight : 15;
            if (this._initialised && skyLight !== this._prevSkyLight) {
                // Only emit when crossing the 0 boundary
                const wasUnderground = this._prevSkyLight === 0;
                const isUnderground = skyLight === 0;
                if (wasUnderground !== isUnderground) {
                    observations.push({
                        type: isUnderground ? 'cave_entered' : 'cave_exited',
                        route: 'queue',
                        data: {
                            biome: this._prevBiome,
                            skyLight,
                            position: {
                                x: Number(pos.x.toFixed(1)),
                                y: Number(pos.y.toFixed(1)),
                                z: Number(pos.z.toFixed(1)),
                            },
                        },
                        timestamp: now,
                        event_id: `${isUnderground ? 'cave_enter' : 'cave_exit'}_${now}`,
                    });
                    if (isUnderground) {
                        this.novelty.recordEncounter('terrain_features', 'cave');
                    }
                }
            }
            this._prevSkyLight = skyLight;
        } catch (_) { /* ignore */ }

        // --- Woke up (isSleeping transition true→false) ---
        try {
            const isSleeping = !!bot.isSleeping;
            if (this._initialised && this._prevIsSleeping === true && isSleeping === false) {
                const obs = this.onEvent('woke_up');
                if (obs) observations.push(obs);
            }
            this._prevIsSleeping = isSleeping;
        } catch (_) { /* ignore */ }

        // --- Player join / leave ---
        try {
            const players = playerList(bot);
            if (this._initialised && players !== this._prevPlayers) {
                const prevSet = new Set((this._prevPlayers || '').split(',').filter(Boolean));
                const currSet = new Set(players.split(',').filter(Boolean));
                const joined = [...currSet].filter(p => !prevSet.has(p) && p !== this.agent.name);
                const left = [...prevSet].filter(p => !currSet.has(p) && p !== this.agent.name);
                // Only emit for the companion player, not for every entity
                if (joined.length > 0 || left.length > 0) {
                    observations.push({
                        type: joined.length > 0 ? 'player_joined' : 'player_left',
                        route: 'queue',
                        data: {
                            joined: joined.length > 0 ? joined : undefined,
                            left: left.length > 0 ? left : undefined,
                        },
                        timestamp: now,
                        event_id: `players_${now}`,
                    });
                }
            }
            this._prevPlayers = players;
        } catch (_) { /* ignore */ }

        // --- Novelty detection (via VisionPerception labels) ---
        try {
            const snapshot = this.agent.vision_perception?.getLatest();
            if (snapshot && snapshot.labels) {
                const biome = this._prevBiome;
                const discoveries = this.novelty.checkNovelty(snapshot.labels, biome);
                for (const d of discoveries) {
                    observations.push({
                        type: 'novel_discovery',
                        route: 'queue',
                        data: {
                            target: d.target,
                            category: d.category,
                            significance: d.significance,
                            familiarity: d.familiarity,
                            encounter_count: d.encounter_count,
                            labels: snapshot.labels,
                            biome,
                        },
                        timestamp: now,
                        event_id: `novel_${d.category}_${d.target}`,
                    });
                }
            }
        } catch (_) { /* ignore */ }

        // [TRACE] Log produced observations
        if (observations.length > 0) {
            console.log('[TRACE:DETECTOR_EVENTS]', JSON.stringify(observations.map(o => ({
                type: o.type,
                route: o.route,
                event_id: o.event_id,
                data_keys: Object.keys(o.data||{}),
            }))));
        }

        this._initialised = true;
        return observations;
    }
}
