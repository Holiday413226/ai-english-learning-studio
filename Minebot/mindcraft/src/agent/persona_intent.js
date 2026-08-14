/**
 * PersonaIntent — 将 event + persona.traits → 结构化 intent。
 *
 * Intent 是 "Persona 想做什么"，不是行为本身。
 * 纯函数，不调用 LLM，不访问 world state（只读传入的 event context）。
 *
 * 设计原则：
 *   - traits 决定 intent 方向，不是硬编码行为
 *   - 不同 traits 组合 → 同一事件产生不同 intent
 *   - LLM 不参与 intent 生成
 */

export class PersonaIntent {
    /**
     * @param {import('./persona.js').Persona} persona
     */
    constructor(persona) {
        this.p = persona;
    }

    /**
     * 输入事件 → 输出结构化 intent。
     *
     * @param {object} event   — observation 对象或 message 对象
     * @param {object} context — { source, threat, importance, type }
     * @returns {object} intent { type, urgency, target, emotion, confidence, reason }
     */
    generate(event, context = {}) {
        const t = this.p.traits;
        const type = event?.type || context?.type || '';
        const importance = event?.attention_score ?? context?.importance ?? 0.5;

        const intent = {
            type: 'observe',        // default
            urgency: 0.2,
            target: null,
            emotion: 'neutral',
            confidence: t.confidence,
            reason: '',
        };

        // ── Combat / Threat ──
        if (type === 'combat' || context.threat) {
            if (t.caution > 0.7) {
                intent.type = 'avoid';
                intent.emotion = 'fear';
                intent.reason = 'too dangerous for my cautious nature';
            } else {
                intent.type = 'engage';
                intent.emotion = t.confidence > 0.5 ? 'determined' : 'nervous';
                intent.reason = 'must defend myself';
            }
            intent.urgency = 0.9;
            intent.target = context.target || 'threat';
        }
        // ── Player interaction ──
        // V5-Converged: Intent recognition is handled by Cognitive LLM.
        // PersonaIntent only provides baseline intent — no regex/action detection.
        else if (type === 'player_message') {
            intent.type = 'respond';
            intent.emotion = t.sociability > 0.6 ? 'friendly' : 'polite';
            intent.urgency = 0.8;
            intent.target = context.source || 'player';
            intent.reason = 'player spoke to me';
        }
        else if (type === 'player_joined') {
            intent.type = t.sociability > 0.5 ? 'greet' : 'observe';
            intent.emotion = t.sociability > 0.5 ? 'welcoming' : 'neutral';
            intent.target = event?.data?.joined?.[0] || 'new player';
            intent.reason = 'someone joined';
        }
        // ── Discovery ──
        else if (type === 'novel_discovery') {
            intent.type = t.curiosity > 0.6 ? 'investigate' : 'observe';
            intent.emotion = t.curiosity > 0.6 ? 'curious' : 'neutral';
            intent.target = event?.data?.target || 'unknown';
            intent.reason = 'never seen this before';
        }
        // ── Danger signals ──
        else if (type === 'player_death') {
            intent.type = 'mourn';
            intent.emotion = 'sad';
            intent.urgency = 0.7;
            intent.reason = 'someone died nearby';
        }
        else if (type === 'cave_entered') {
            intent.type = t.caution > 0.6 ? 'proceed_cautiously' : 'explore';
            intent.emotion = t.caution > 0.6 ? 'apprehensive' : 'excited';
            intent.reason = 'entering a dark place';
        }
        // ── Environmental ──
        else if (type === 'weather_change') {
            intent.type = 'observe';
            intent.emotion = event?.data?.weather === 'Thunderstorm' ? 'uneasy' : 'neutral';
        }
        else if (type === 'sunrise') {
            intent.type = 'observe';
            intent.emotion = 'refreshed';
            intent.reason = 'new day beginning';
        }
        else if (type === 'sunset') {
            intent.type = 'observe';
            intent.emotion = t.caution > 0.5 ? 'alert' : 'calm';
            intent.reason = 'night is falling';
        }
        // ── Idle / Periodic ──
        else if (type === 'periodic' || type === 'idle') {
            intent.type = 'observe';
            intent.urgency = 0.2;
            intent.emotion = 'calm';
            intent.reason = 'nothing urgent happening';
        }
        // ── Low importance fallback ──
        else if (importance < 0.3) {
            intent.type = 'ignore';
            intent.reason = 'low importance event';
        }

        intent.confidence = t.confidence;
        return intent;
    }
}
