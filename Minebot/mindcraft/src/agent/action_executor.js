/**
 * Action Executor — Action Object ↔ Minecraft !command 双向转换。
 *
 * 这是 Minecraft 命令语法的唯一持有者。
 * Persona / ActionPlanner / LLM 不应直接引用 !command 字符串。
 *
 * 设计原则：
 *   - Action Object 是角色认知层（"follow Rain"）
 *   - !command 是执行层（"!followPlayer('Rain', 4)"）
 *   - 两层之间的映射仅在此文件维护
 */

/**
 * Action type → !command mapping.
 * 每个 entry 定义: command 名称 + 如何从 Action Object 提取参数。
 */
const ACTION_DEFS = {
    follow: {
        command: '!followPlayer',
        args: (a) => [a.target, a.params?.distance ?? 4],
    },
    go_to_player: {
        command: '!goToPlayer',
        args: (a) => [a.target, a.params?.distance ?? 3],
    },
    attack: {
        command: '!attack',
        args: (a) => [a.target],
    },
    move_away: {
        command: '!moveAway',
        args: (a) => [a.params?.distance ?? 10],
    },
    collect: {
        command: '!collectBlocks',
        args: (a) => [a.target, a.params?.count ?? 10],
    },
    give: {
        command: '!givePlayer',
        args: (a) => [a.target, a.params?.item, a.params?.count ?? 1],
    },
    stop: {
        command: '!stop',
        args: () => [],
    },
    stay: {
        command: '!stay',
        args: (a) => [a.params?.seconds ?? 30],
    },
    go_to_position: {
        command: '!goToCoordinates',
        args: (a) => [a.params.x, a.params.y, a.params.z, a.params?.closeness ?? 2],
    },
    craft: {
        command: '!craftRecipe',
        args: (a) => [a.target, a.params?.count ?? 1],
    },
    equip: {
        command: '!equip',
        args: (a) => [a.target],
    },
    consume: {
        command: '!consume',
        args: (a) => [a.target],
    },
    discard: {
        command: '!discard',
        args: (a) => [a.target, a.params?.count ?? 1],
    },
    search_block: {
        command: '!searchForBlock',
        args: (a) => [a.target, a.params?.range ?? 64],
    },
};

/**
 * Convert an Action Object to a Minecraft !command string.
 *
 * @param {object} action — {type, target, params}
 * @returns {string|null} — "!commandName(args)" or null if type unknown
 */
export function actionToCommand(action) {
    if (!action || !action.type) return null;
    const def = ACTION_DEFS[action.type];
    if (!def) return null;

    const rawArgs = def.args(action);
    const argStr = rawArgs.map(a => {
        if (typeof a === 'string') return `"${a}"`;
        if (typeof a === 'number') return a;
        return String(a);
    }).join(', ');

    return argStr.length > 0 ? `${def.command}(${argStr})` : def.command;
}

/**
 * Convert a parsed !command back to an Action Object.
 * Used when LLM outputs !command syntax (backward-compatible path).
 *
 * @param {string} commandName — e.g. "!followPlayer"
 * @param {Array} args — e.g. ["Rain", 4]
 * @returns {object|null} — {type, target, params} or null
 */
export function commandToAction(commandName, args = []) {
    for (const [type, def] of Object.entries(ACTION_DEFS)) {
        if (def.command === commandName) {
            return buildActionObject(type, args);
        }
    }
    return null;
}

/**
 * Check if a request type maps to an executable action.
 */
export function isActionType(requestType) {
    return requestType in ACTION_DEFS;
}

/**
 * Get the list of all supported action types.
 */
export function getSupportedActionTypes() {
    return Object.keys(ACTION_DEFS);
}

/**
 * Parse an LLM Cognitive output into a structured Action Proposal.
 * Handles markdown fences, extra whitespace, and invalid JSON gracefully.
 *
 * @param {string} llmOutput — raw output from Cognitive LLM call
 * @returns {object|null} — {type, action?, intent_analysis?} or null on parse failure
 */
export function parseActionProposal(llmOutput) {
    if (!llmOutput || typeof llmOutput !== 'string') return null;
    try {
        let jsonStr = llmOutput.trim();
        // Remove markdown code fences if present
        jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
        const parsed = JSON.parse(jsonStr);
        if (parsed.type === 'action' && parsed.action?.type) {
            return parsed;
        }
        if (parsed.type === 'chat') {
            return parsed;
        }
        return null;
    } catch (e) {
        console.warn('[ACTION_EXECUTOR] Failed to parse Cognitive output:', e.message);
        return null;
    }
}

// ── Internal helpers ──

function buildActionObject(type, args) {
    switch (type) {
        case 'follow':
            return { type, target: args[0], params: { distance: args[1] ?? 4 } };
        case 'go_to_player':
            return { type, target: args[0], params: { distance: args[1] ?? 3 } };
        case 'attack':
            return { type, target: args[0] };
        case 'move_away':
            return { type, params: { distance: args[0] ?? 10 } };
        case 'collect':
            return { type, target: args[0], params: { count: args[1] ?? 10 } };
        case 'give':
            return { type, target: args[0], params: { item: args[1], count: args[2] ?? 1 } };
        case 'stop':
            return { type };
        case 'stay':
            return { type, params: { seconds: args[0] ?? 30 } };
        case 'go_to_position':
            return { type, params: { x: args[0], y: args[1], z: args[2], closeness: args[3] ?? 2 } };
        case 'craft':
            return { type, target: args[0], params: { count: args[1] ?? 1 } };
        case 'equip':
            return { type, target: args[0] };
        case 'consume':
            return { type, target: args[0] };
        case 'discard':
            return { type, target: args[0], params: { count: args[1] ?? 1 } };
        case 'search_block':
            return { type, target: args[0], params: { range: args[1] ?? 64 } };
        default:
            return { type, args };
    }
}
