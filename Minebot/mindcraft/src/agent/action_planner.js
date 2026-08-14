/**
 * ActionPlanner — intent → executable plan。
 *
 * 将 PersonaIntent 产生的抽象 intent 转换为具体的行动计划，
 * 供 Minecraft !command 执行和 LLM narration 使用。
 *
 * 纯函数，不调用 LLM，不访问 world state。
 *
 * 设计原则：
 *   - plan 是 "怎么执行" 的蓝图，不含语言表达
 *   - narration_hint 是给 LLM 的方向提示（LLM 只负责措辞）
 *   - suggested_command 是可选的具体 !command
 *   - memory_write 由 plan 决定（不是 policy / LLM 决定）
 */

export class ActionPlanner {
    /**
     * @param {object} intent   — from PersonaIntent.generate()
     * @param {object} event    — original event (unused currently, reserved)
     * @param {import('./persona.js').Persona} persona — for trait context
     * @returns {object} plan
     */
    plan(intent, _event, persona) {
        const plan = {
            primary_action: 'observe',
            sub_actions: [],
            memory_write: false,
            attention_cost: 0.5,
            narration_hint: '',
            suggested_command: null,
        };

        switch (intent.type) {

            case 'engage':
                plan.primary_action = 'attack_or_interact';
                plan.sub_actions = ['approach_target', 'select_weapon'];
                plan.narration_hint = `express ${intent.emotion} determination`;
                plan.suggested_command = '!attack nearest';
                plan.memory_write = true;
                break;

            case 'avoid':
                plan.primary_action = 'retreat';
                plan.sub_actions = ['increase_distance', 'find_cover'];
                plan.narration_hint = `express ${intent.emotion}, seek safety`;
                plan.suggested_command = '!moveAway 10';
                plan.memory_write = true;
                break;

            case 'respond':
                // V5-Converged: Intent recognition is handled by Cognitive LLM.
                // ActionPlanner no longer pre-detects action requests.
                // Cognitive determines chat vs action; Persona evaluates proposals.
                plan.primary_action = 'respond_to_player';
                plan.sub_actions = ['cognitive_intent_recognition'];
                plan.narration_hint = `be ${intent.emotion}, concise, natural`;
                plan.memory_write = false;
                break;

            case 'greet':
                plan.primary_action = 'talk';
                plan.sub_actions = ['generate_greeting'];
                plan.narration_hint = `be ${intent.emotion}, welcoming`;
                plan.memory_write = false;
                break;

            case 'investigate':
                plan.primary_action = 'explore';
                plan.sub_actions = ['approach_target', 'scan_surroundings'];
                plan.narration_hint = 'express curiosity about the new discovery';
                plan.suggested_command = null; // LLM decides navigation
                plan.memory_write = true;
                break;

            case 'mourn':
                plan.primary_action = 'express_empathy';
                plan.sub_actions = ['generate_mourning_response'];
                plan.narration_hint = 'express sadness and empathy sincerely';
                plan.memory_write = true;
                break;

            case 'proceed_cautiously':
                plan.primary_action = 'move_carefully';
                plan.sub_actions = ['check_surroundings', 'prepare_light_source'];
                plan.narration_hint = 'express caution, suggest lighting torches';
                plan.suggested_command = null; // LLM decides to use !placeTorch or not
                plan.memory_write = true;
                break;

            case 'explore':
                plan.primary_action = 'explore';
                plan.sub_actions = ['scan_dark_areas', 'move_forward'];
                plan.narration_hint = 'express excitement and curiosity';
                plan.memory_write = true;
                break;

            case 'ignore':
                plan.primary_action = 'ignore';
                plan.sub_actions = [];
                plan.narration_hint = '';
                plan.memory_write = false;
                plan.attention_cost = 0;
                break;

            case 'observe':
            default:
                plan.primary_action = 'observe';
                plan.sub_actions = [];
                plan.narration_hint = intent.emotion === 'calm'
                    ? 'make a casual observation about surroundings'
                    : 'note your surroundings naturally';
                plan.memory_write = false;
                break;
        }

        return plan;
    }
}

/**
 * Default params for each action type.
 * These are sensible defaults — Persona.evaluateActionProposal() may modify them
 * (e.g., smaller follow distance for trusted companions).
 */
function _defaultParams(requestType) {
    switch (requestType) {
        case 'follow':       return { distance: 4 };
        case 'go_to_player': return { distance: 3 };
        case 'collect':      return { count: 10 };
        case 'stay':         return { seconds: 30 };
        case 'move_away':    return { distance: 10 };
        case 'give':         return { count: 1 };
        case 'craft':        return { count: 1 };
        case 'discard':      return { count: 1 };
        case 'search_block': return { range: 64 };
        default:             return {};
    }
}
