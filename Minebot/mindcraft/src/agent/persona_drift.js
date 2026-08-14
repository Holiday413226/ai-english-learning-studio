/**
 * Persona Drift — 基于事件轻微调整 Persona traits。
 * 纯函数，无状态，不调用 LLM。
 * 所有变化 clamped to [0, 1]，幅度 0.01~0.08 per event。
 *
 * 设计原则：
 *   - 只做微量调整，长期积累才可见效果
 *   - 不引入新状态，只修改 Persona.traits
 *   - 不影响 observer / history / prompt 主链路
 */

// ---------------------------------------------------------------------------
// Drift rules — { condition, trait, delta }
// ---------------------------------------------------------------------------
const DRIFT_RULES = [
    // ── 战斗 / 危险 ──
    { cond: e => e?.type === 'combat' || e?.type === 'player_death',
      trait: 'caution',     delta: +0.05 },
    { cond: e => e?.type === 'combat_win',
      trait: 'confidence',  delta: +0.05 },
    { cond: e => e?.type === 'combat_lose' || e?.type === 'near_death',
      trait: 'confidence',  delta: -0.03 },

    // ── 社交 ──
    { cond: e => e?.type === 'player_message',
      trait: 'sociability', delta: +0.02 },
    { cond: e => e?.type === 'help_player' || e?.type === 'player_thanked',
      trait: 'helpfulness', delta: +0.03 },
    { cond: e => e?.type === 'player_ignored' || e?.type === 'player_insult',
      trait: 'sociability', delta: -0.02 },

    // ── 探索 ──
    { cond: e => e?.type === 'novel_discovery' || e?.type === 'biome_change',
      trait: 'curiosity',   delta: +0.02 },
    { cond: e => e?.type === 'cave_entered',
      trait: 'caution',     delta: +0.03 },

    // ── 闲置 ──
    { cond: e => e?.type === 'idle',
      trait: 'playfulness', delta: +0.01 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp trait value to [0, 1] with 2-decimal precision. */
function clamp(v) {
    return Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
}

// ---------------------------------------------------------------------------
// applyTraitDrift
// ---------------------------------------------------------------------------

/**
 * Apply trait drift based on an event.
 * Called from observer._enqueue and agent death handler.
 *
 * @param {import('./persona.js').Persona} persona
 * @param {object} event — observation object or plain { type, attention_score }
 */
export function applyTraitDrift(persona, event) {
    if (!persona || !persona.traits || !event) return;

    for (const rule of DRIFT_RULES) {
        if (rule.cond(event)) {
            const old = persona.traits[rule.trait];
            if (typeof old !== 'number') continue; // unknown trait → skip
            persona.traits[rule.trait] = clamp(old + rule.delta);
        }
    }
}
