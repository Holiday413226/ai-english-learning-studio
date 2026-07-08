/**
 * CompanionBehaviorHook — interface for non-verbal companion behaviours.
 *
 * P1 scope: interface definition + registration mechanism ONLY.
 * No behaviours are implemented yet.  Concrete handlers will be
 * registered in P2 (long-term memory) and P3 (interest/preferences).
 *
 * Design:
 *   - Callback-registration pattern so behaviours can be added/removed
 *     without touching Observer internals.
 *   - Two event channels:
 *       onObservation  — fires when the Observer enqueues a new observation.
 *       onIdleTick     — fires every agent.update() when the agent is idle,
 *                        giving behaviours a chance to add ambient micro-actions
 *                        (glance at player, turn toward sunrise, etc.).
 *
 * This hook is called by Observer.  It does NOT interact with LLM or chat.
 */

export class CompanionBehaviorHook {
    /**
     * @param {object} agent  The Agent instance (access to bot, skills, world).
     */
    constructor(agent) {
        this.agent = agent;
        this._handlers = {
            onObservation: [],   // (observation, agent) => void
            onIdleTick: [],      // (deltaMs, agent) => void
        };
    }

    /**
     * Register a behaviour handler.
     * @param {'onObservation'|'onIdleTick'} event
     * @param {function} handler
     */
    register(event, handler) {
        if (!this._handlers[event]) {
            throw new Error(`Unknown CompanionBehavior event: ${event}`);
        }
        this._handlers[event].push(handler);
    }

    /**
     * Unregister a previously registered handler.
     * @param {'onObservation'|'onIdleTick'} event
     * @param {function} handler
     */
    unregister(event, handler) {
        const list = this._handlers[event];
        if (list) {
            const idx = list.indexOf(handler);
            if (idx !== -1) list.splice(idx, 1);
        }
    }

    /** Called by Observer when an observation is enqueued. */
    notifyObservation(observation) {
        for (const h of this._handlers.onObservation) {
            try { h(observation, this.agent); } catch (_) { /* best-effort */ }
        }
    }

    /** Called by Observer on every idle tick. */
    tick(delta) {
        for (const h of this._handlers.onIdleTick) {
            try { h(delta, this.agent); } catch (_) { /* best-effort */ }
        }
    }
}
