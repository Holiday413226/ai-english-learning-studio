/**
 * Persona — 角色行为决策内核。
 *
 * Persona = identity + traits + intent engine + action planner + drift。
 *
 * 设计原则：
 *   - Persona 是 "行为决策内核"，不是 "prompt 数据源"
 *   - LLM 只负责语言表达（narration），Persona 决定 "what to do"
 *   - core 不可变（仅用户脚本可修改）
 *   - traits 可微调（drift 系统 0.01~0.08 per event）
 *   - globalMemory 跨世界持久化（角色核心经验）
 *   - worldMemories 按 worldId 隔离（每个世界的独立记忆）
 *
 * 架构位置：
 *   event → AttentionFilter → IntentGenerator → ActionPlanner → MemoryDecision
 *                                                                  ↓
 *                                                            LLM (narration only)
 */

import { PersonaIntent } from './persona_intent.js';
import { ActionPlanner } from './action_planner.js';
import { applyTraitDrift } from './persona_drift.js';
import { loadPersonaData, savePersona } from './persona_store.js';

// Re-export store functions so callers only need one import
export { loadPersonaData, savePersona };

export class Persona {
    /**
     * @param {string} id       — stable persona identifier
     * @param {object} profile  — { name, identity, backstory, voice_style, traits }
     */
    constructor(id, profile = {}) {
        this.id = id;
        this.name = profile.name || id;

        // ═══ IMMUTABLE CORE（仅用户脚本可修改）═══
        this.core = {
            identity: profile.identity || '',
            backstory: profile.backstory || '',
            voice_style: profile.voice_style || 'natural and friendly',
            characterScript: profile.characterScript || '',
        };

        // ═══ MUTABLE TRAITS（drift 系统可微调，clamped [0, 1]）═══
        this.traits = {
            curiosity:   profile.traits?.curiosity   ?? 0.5,
            caution:     profile.traits?.caution     ?? 0.5,
            sociability: profile.traits?.sociability ?? 0.5,
            confidence:  profile.traits?.confidence  ?? 0.5,
            helpfulness: profile.traits?.helpfulness ?? 0.5,
            playfulness: profile.traits?.playfulness ?? 0.5,
            ...(profile.traits || {}),
        };

        // ═══ MEMORY — global (跨世界) + per-world (世界内) ═══
        /** @type {string} Core experiences that persist across ALL worlds */
        this.globalMemory = '';
        /** @type {Object<string, string>} World-specific memories keyed by worldId */
        this.worldMemories = {};

        // ═══ WORLD ANCHORS（按 worldId 隔离的世界元数据）═══
        // { worldId: { summary: '', lastSeen: timestamp } }
        this.worldAnchors = {};

        // ═══ RELATIONSHIPS（按 playerName 追踪的玩家关系）═══
        // { playerName: { interactionCount, trustLevel, firstInteraction } }
        this.relationships = {};

        // ═══ SUBSYSTEMS ═══
        this.intentEngine = new PersonaIntent(this);
        this.actionPlanner = new ActionPlanner();
        this._drift = applyTraitDrift; // 函数引用，避免 drift.js 循环导入

        // ═══ ACTIVE BEHAVIOR — owned by Persona, not Agent ═══
        /** @type {{ intent: object, plan: object } | null} */
        this.activeBehavior = null;
    }

    // ------------------------------------------------------------------
    // 核心入口：行为生成
    // ------------------------------------------------------------------

    /**
     * event → intent → plan → { intent, plan }
     * 这是 Persona 运行时决策的唯一入口。替换旧 shouldAct()。
     *
     * @param {object} event   — observation 对象或 message 字符串
     * @param {object} context — { source, threat, importance, type }
     * @returns {{ intent: object, plan: object }}
     */
    generateBehavior(event, context = {}) {
        const intent = this.intentEngine.generate(event, context);
        const plan = this.actionPlanner.plan(intent, event, this);
        return { intent, plan };
    }

    // ------------------------------------------------------------------
    // Active behavior management
    // ------------------------------------------------------------------

    /**
     * Set active behavior with urgency-based arbitration.
     * Higher urgency intent overrides lower urgency intent.
     * Equal urgency → newer wins.
     *
     * @param {object} intent
     * @param {object} plan
     */
    setActiveBehavior(intent, plan) {
        const newUrgency = intent?.urgency ?? 0;
        const oldUrgency = this.activeBehavior?.intent?.urgency ?? 0;
        if (!this.activeBehavior || newUrgency >= oldUrgency) {
            this.activeBehavior = { intent, plan };
        }
    }

    // ------------------------------------------------------------------
    // 注意力过滤
    // ------------------------------------------------------------------

    /**
     * 在 observer._enqueue 前调用。
     * 决定事件是否值得进入 active_queue。
     *
     * @param {object} event — observation 对象
     * @returns {boolean}
     */
    shouldAttend(event) {
        const score = event?.attention_score ?? 0.5;
        // 低于绝对阈值的直接丢弃
        if (score < 0.25) return false;
        // curiosity 低的 persona 忽略 ambient 事件
        if (event?.type === 'periodic' && this.traits.curiosity < 0.3) return false;
        return true;
    }

    // ------------------------------------------------------------------
    // 记忆写入决策
    // ------------------------------------------------------------------

    /**
     * 改由 plan.memory_write 驱动（不再由 policy 决定）。
     *
     * @param {object} plan — from ActionPlanner.plan()
     * @returns {boolean}
     */
    shouldRemember(plan) {
        return plan?.memory_write === true;
    }

    // ------------------------------------------------------------------
    // Trait drift
    // ------------------------------------------------------------------

    /**
     * 应用 trait drift，在 observer._enqueue 和 agent death handler 中调用。
     *
     * @param {object} event — { type, attention_score, ... }
     */
    drift(event) {
        this._drift(this, event);
    }

    // ------------------------------------------------------------------
    // World anchor management
    // ------------------------------------------------------------------

    getWorldAnchor(worldId) {
        return this.worldAnchors[worldId] || null;
    }

    setWorldAnchor(worldId, summary) {
        this.worldAnchors[worldId] = {
            summary,
            lastSeen: Date.now(),
        };
    }

    // ------------------------------------------------------------------
    // Memory access (global vs per-world)
    // ------------------------------------------------------------------

    /** @returns {string} Cross-world core experiences */
    getGlobalMemory() { return this.globalMemory; }

    setGlobalMemory(memory) { this.globalMemory = memory; }

    /** @returns {string} World-specific memory for the given worldId */
    getWorldMemory(worldId) { return this.worldMemories[worldId] || ''; }

    setWorldMemory(worldId, memory) { this.worldMemories[worldId] = memory; }

    // ------------------------------------------------------------------
    // Prompt 构建
    // ------------------------------------------------------------------

    /** @returns {string} $PERSONA prompt block */
    buildPrompt() {
        const t = this.traits;
        let p = `[PERSONA — Core Identity — IMMUTABLE]
You are ${this.name}. ${this.core.identity}
${this.core.backstory ? 'Background: ' + this.core.backstory : ''}
Voice style: ${this.core.voice_style}`;

        if (this.core.characterScript) {
            p += `\n\n[CHARACTER SCRIPT]
${this.core.characterScript}`;
        }

        p += `\n\n[PERSONA TRAITS — Your Behavioral Tendencies]
Curiosity:${t.curiosity.toFixed(2)} Caution:${t.caution.toFixed(2)}
Sociability:${t.sociability.toFixed(2)} Confidence:${t.confidence.toFixed(2)}
Helpfulness:${t.helpfulness.toFixed(2)} Playfulness:${t.playfulness.toFixed(2)}`;

        return p;
    }

    /**
     * V5-Converged: Minimal Persona for Expression path.
     * Expression LLM receives ONLY identity + voice + core principles —
     * NO characterScript behavioral rules, NO backstory, NO trait values.
     * This prevents the LLM from independently "role-playing" decisions
     * that belong to Persona Gate.
     *
     * @returns {string} minimal $EXPRESSION_PERSONA prompt block
     */
    buildExpressionPrompt() {
        let p = `[PERSONA — Core Identity]
You are ${this.name}. ${this.core.identity}
Voice style: ${this.core.voice_style}`;

        // Core immutable principles (the character's moral bottom line)
        if (this.core.characterScript) {
            const script = this.core.characterScript;
            const principles = [];
            // Extract: pacifism
            if (/never\s+(attack|harm|kill|hurt)|hate\s+violence|peaceful|pacifist|non-?violen/i.test(script)) {
                principles.push('I will never harm or kill any creature.');
            }
            // Extract: protection
            if (/protect|guard|defend/i.test(script)) {
                principles.push('I protect those who cannot protect themselves.');
            }
            if (principles.length > 0) {
                p += '\n\n[Core Principles — IMMUTABLE]\n' + principles.join('\n');
            }
        }

        return p;
    }

    /** @returns {string} $PERSONA_MEMORY prompt block */
    buildMemoryPrompt(currentWorldId) {
        let mem = `[PERSONA GLOBAL MEMORY — Cross-World Core Experiences]
${this.globalMemory || 'No cross-world experiences yet.'}`;

        if (currentWorldId && this.worldMemories[currentWorldId]) {
            mem += `\n\n[WORLD MEMORY — Current World: ${currentWorldId}]
${this.worldMemories[currentWorldId]}`;
        }

        return mem;
    }

    // ------------------------------------------------------------------
    // Relationship management
    // ------------------------------------------------------------------

    /**
     * Update relationship counters when a player interacts with this persona.
     * Called from agent.js on each player_message.
     *
     * @param {string} playerName
     */
    updateRelationship(playerName) {
        if (!playerName) return;
        if (!this.relationships[playerName]) {
            this.relationships[playerName] = {
                interactionCount: 0,
                trustLevel: 0,
                firstInteraction: Date.now(),
            };
        }
        const rel = this.relationships[playerName];
        rel.interactionCount++;
        const daysKnown = (Date.now() - rel.firstInteraction) / (1000 * 60 * 60 * 24);
        rel.trustLevel = Math.min(1.0, rel.interactionCount / 15 + (daysKnown > 1 ? 0.2 : 0));
    }

    /**
     * Get relationship data for a player.
     *
     * @param {string} playerName
     * @returns {{interactionCount: number, trustLevel: number, isStranger: boolean, isTrusted: boolean, daysKnown: number}}
     */
    getRelationship(playerName) {
        const rel = this.relationships[playerName];
        if (!rel) {
            return { interactionCount: 0, trustLevel: 0, isStranger: true, isTrusted: false, daysKnown: 0 };
        }
        const daysKnown = (Date.now() - rel.firstInteraction) / (1000 * 60 * 60 * 24);
        return {
            interactionCount: rel.interactionCount,
            trustLevel: rel.trustLevel,
            isStranger: rel.trustLevel < 0.15,
            isTrusted: rel.trustLevel >= 0.7,
            daysKnown,
        };
    }

    // ------------------------------------------------------------------
    // Social Decision Layer
    // ------------------------------------------------------------------

    /**
     * Evaluate whether this persona would accept a proposed action.
     *
     * This is the core of Persona autonomy — it evaluates action semantics
     * (not Minecraft command syntax) against character identity, relationship,
     * world state, and traits.
     *
     * @param {object} action  — {type, target, params} (Action Object, NOT !command)
     * @param {object} context — {source, worldState, agentHistory?}
     * @returns {{decision: string, reason: string, action?: object, speech_hint?: string}}
     */
    evaluateActionProposal(action, context = {}) {
        if (!action || !action.type) {
            return { decision: 'accept', reason: 'No action to evaluate.' };
        }

        const rel = this.getRelationship(context.source);
        const t = this.traits;
        const script = this.core.characterScript || '';

        // ═══ 1. Character Script — HARD CONSTRAINTS (highest priority) ═══
        if (action.type === 'attack') {
            const isPeaceful = /never\s+(attack|harm|kill|hurt)|hate\s+violence|peaceful|pacifist|non-?violen/i.test(script);
            if (isPeaceful) {
                return {
                    decision: 'reject',
                    reason: 'My core identity forbids violence against any creature.',
                    speech_hint: 'politely_decline',
                };
            }
            // Only attack hostile mobs, never villagers/players unless script allows
            const target = String(action.target || '').toLowerCase();
            const protectsInnocents = /protect|guard|defend|never\s+(attack|harm)\s+innocent/i.test(script);
            if (protectsInnocents && (target === 'villager' || target === 'player')) {
                return {
                    decision: 'reject',
                    reason: 'I protect the innocent — I will not harm them.',
                    speech_hint: 'politely_decline',
                };
            }
        }

        // ═══ 2. World State ═══
        // NOTE: inCombat check removed — worldState.summarize() does not exist,
        // so context.worldState was always undefined (dead code).
        // If inCombat logic is needed, implement WorldStateManager.summarize() first,
        // then consider NOT blocking follow (player may want to lead bot to safety).

        // ═══ 3. Relationship ═══
        if (rel.isStranger) {
            if (action.type === 'follow') {
                if (t.sociability < 0.4) {
                    return {
                        decision: 'hesitate',
                        reason: 'I do not know this person well enough to follow them.',
                        speech_hint: 'ask_why',
                    };
                }
                if (t.caution > 0.5) {
                    return {
                        decision: 'hesitate',
                        reason: 'I need to understand why before following a stranger.',
                        speech_hint: 'ask_why',
                    };
                }
            }
            if (action.type === 'give' && t.helpfulness < 0.6) {
                return {
                    decision: 'hesitate',
                    reason: 'I do not know this person well enough to give them my items.',
                    speech_hint: 'ask_why',
                };
            }
        }

        // ═══ 4. Trusted companion modifications ═══
        if (rel.isTrusted) {
            if (action.type === 'follow') {
                return {
                    decision: 'modify',
                    action: {
                        ...action,
                        params: { ...action.params, distance: 2 },
                    },
                    reason: 'A trusted companion — I will follow closely.',
                    speech_hint: 'confirm_briefly',
                };
            }
        }

        // ═══ 5. Traits ═══
        if (t.helpfulness < 0.2 && rel.isStranger) {
            return {
                decision: 'reject',
                reason: 'I have little reason to help a complete stranger.',
                speech_hint: 'indifferent',
            };
        }
        if (action.type === 'attack' && t.caution > 0.8) {
            return {
                decision: 'reject',
                reason: 'I am too cautious to engage in combat.',
                speech_hint: 'express_fear',
            };
        }

        // ═══ 6. Default: accept ═══
        return {
            decision: 'accept',
            reason: 'I see no reason to refuse this request.',
        };
    }

    /**
     * V5-Converged: evaluate with runtime context for Expression LLM.
     * Wraps evaluateActionProposal and adds relationship + decision context
     * so the Expression LLM can produce state-aware narration.
     *
     * @returns {{decision, reason, action?, speech_hint?, runtime_context}}
     */
    evaluateWithContext(action, context = {}) {
        const result = this.evaluateActionProposal(action, context);
        const rel = this.getRelationship(context.source);

        result.runtime_context = {
            relationship: {
                trust: rel.trustLevel,
                phase: rel.isStranger ? 'stranger' :
                       rel.isTrusted ? 'companion' : 'acquaintance',
                interactions: rel.interactionCount,
                daysKnown: Math.floor(rel.daysKnown),
            },
            trigger: this._describeTrigger(result, rel),
        };

        return result;
    }

    /**
     * Describe what triggered this decision, for Expression LLM context.
     * @private
     */
    _describeTrigger(result, rel) {
        const parts = [];
        if (rel.isStranger) parts.push('stranger');
        if (rel.isTrusted) parts.push('trusted_companion');
        const t = this.traits;
        if (t.caution > 0.5) parts.push('cautious');
        if (t.helpfulness < 0.6) parts.push('selective_helpfulness');
        if (t.sociability < 0.4) parts.push('unsociable');
        if (!parts.length) parts.push('default_accept');
        return parts.join('+');
    }

    // ------------------------------------------------------------------
    // Serialization
    // ------------------------------------------------------------------

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            core: this.core,
            traits: this.traits,
            globalMemory: this.globalMemory,
            worldMemories: this.worldMemories,
            worldAnchors: this.worldAnchors,
            relationships: this.relationships,
        };
    }

    /**
     * Deserialize from plain object (from persona_store.loadPersonaData).
     * @param {object} data
     * @returns {Persona}
     */
    static fromJSON(data) {
        if (!data || !data.id) return null;
        const p = new Persona(data.id, {
            name: data.name,
            identity: data.core?.identity,
            backstory: data.core?.backstory,
            voice_style: data.core?.voice_style,
            characterScript: data.core?.characterScript,
            traits: data.traits,
        });
        p.globalMemory = data.globalMemory || data.personaMemory || '';
        p.worldMemories = data.worldMemories || {};
        p.worldAnchors = data.worldAnchors || {};
        p.relationships = data.relationships || {};
        return p;
    }
}
