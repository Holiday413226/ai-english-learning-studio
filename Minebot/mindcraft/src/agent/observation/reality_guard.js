/**
 * RealityGuard — V4 prompt-generation sub-module.
 *
 * In V5, RealityGuard lives inside world_state.js as a sub-module of
 * WorldStateManager. This file is a thin re-export for backward
 * compatibility and standalone usage.
 *
 * See world_state.js for the full implementation:
 *   - FactStore (ground-truth observations)
 *   - ActionLog (executed command registry)
 *   - RealityGuard (prompt generation from FactStore + ActionLog)
 *   - WorldStateManager (top-level orchestrator)
 */

export { RealityGuard, FactStore, ActionLog, WorldStateManager } from './world_state.js';
