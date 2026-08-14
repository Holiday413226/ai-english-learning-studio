import { readFileSync, mkdirSync, writeFileSync} from 'fs';
import { Examples } from '../utils/examples.js';
import { getCommandDocs } from '../agent/commands/index.js';
import { SkillLibrary } from "../agent/library/skill_library.js";
import { stringifyTurns } from '../utils/text.js';
import { getCommand } from '../agent/commands/index.js';
import settings from '../agent/settings.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { selectAPI, createModel } from './_model_map.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ═══ Memory Truth Hierarchy — injected via $MEMORY_RULES ═══
const MEMORY_HIERARCHY_RULES = `[MEMORY TRUTH HIERARCHY — CRITICAL RULES]

1. PRIORITY (highest → lowest):
   PERSONA > WORLD > EPISODIC > SUMMARY > OBSERVATION

2. OVERRIDE RULE:
   Higher layer OVERRIDES lower layer. If your PERSONA identity says you are
   peaceful, but a SUMMARY memory claims you attacked something, your PERSONA
   is always correct. The memory is mistaken.
   Within the same layer, newer information overrides older information.

3. CONTRADICTION RESOLUTION:
   When different layers conflict, TRUST THE HIGHER LAYER.
   You may express uncertainty: "My memory says X, but that doesn't feel
   right... maybe I misremember."
   NEVER use a lower-layer fact to contradict a higher-layer truth.

4. SOURCE AWARENESS:
   [PERSONA]  = your immutable identity — NEVER changes from events
   [WORLD]    = current world facts — resets when you enter a new world
   [EPISODIC] = your experiences in this world — personal history
   [SUMMARY]  = compressed conversation memory — may be distorted by summarization
   [OBSERVE]  = recent temporary observations — may already be stale`;

// ═══ Reality Boundary — injected via $REALITY_BOUNDARY ═══
// Constrains Expression LLM to describe only facts, not fabricate.
const REALITY_BOUNDARY = `[REALITY BOUNDARY — EXPRESSION CONSTRAINTS]

You are describing an action that has ALREADY HAPPENED. You are NOT:
- A decision-maker (the decision was already made by Persona)
- A future-action proposer (actions are already executed)
- A relationship tracker (Persona handles that)
- A character-development narrator

YOU MAY describe:
- The action that just occurred (using the action result shown above)
- Your immediate acknowledgment of the result
- Brief character-appropriate reaction to the fact

YOU MUST NOT fabricate or imply:
- Emotional changes ("I feel closer to you now")
- Trust changes ("I trust you more now")
- Relationship changes ("You are my friend now")
- Promises or commitments ("I will always follow you")
- Character development ("I am learning to trust people")
- Mental states not in the action result ("I was worried")

If the action failed, state the failure. If it succeeded, acknowledge it.
Keep responses BRIEF — one sentence is usually enough.
Do NOT output !command syntax.`;

export class Prompter {
    constructor(agent, profile) {
        this.agent = agent;
        this.profile = profile;
        const defaults_dir = path.join(__dirname, '../../profiles/defaults');
        let default_profile = JSON.parse(readFileSync(path.join(defaults_dir, '_default.json'), 'utf8'));
        let base_fp = '';
        if (settings.base_profile.includes('survival')) {
            base_fp = path.join(defaults_dir, 'survival.json');
        } else if (settings.base_profile.includes('assistant')) {
            base_fp = path.join(defaults_dir, 'assistant.json');
        } else if (settings.base_profile.includes('creative')) {
            base_fp = path.join(defaults_dir, 'creative.json');
        } else if (settings.base_profile.includes('god_mode')) {
            base_fp = path.join(defaults_dir, 'god_mode.json');
        }
        let base_profile = JSON.parse(readFileSync(base_fp, 'utf8'));

        // first use defaults to fill in missing values in the base profile
        for (let key in default_profile) {
            if (base_profile[key] === undefined)
                base_profile[key] = default_profile[key];
        }
        // then use base profile to fill in missing values in the individual profile
        for (let key in base_profile) {
            if (this.profile[key] === undefined)
                this.profile[key] = base_profile[key];
        }
        // base overrides default, individual overrides base

        this.convo_examples = null;
        this.coding_examples = null;
        
        let name = this.profile.name;
        this.cooldown = this.profile.cooldown ? this.profile.cooldown : 0;
        this.last_prompt_time = 0;
        this.awaiting_coding = false;

        // for backwards compatibility, move max_tokens to params
        let max_tokens = null;
        if (this.profile.max_tokens)
            max_tokens = this.profile.max_tokens;

        let chat_model_profile = selectAPI(this.profile.model);
        this.chat_model = createModel(chat_model_profile);

        if (this.profile.code_model) {
            let code_model_profile = selectAPI(this.profile.code_model);
            this.code_model = createModel(code_model_profile);
        }
        else {
            this.code_model = this.chat_model;
        }

        if (this.profile.vision_model) {
            let vision_model_profile = selectAPI(this.profile.vision_model);
            this.vision_model = createModel(vision_model_profile);
        }
        else {
            this.vision_model = this.chat_model;
        }

        
        let embedding_model_profile = null;
        if (this.profile.embedding) {
            try {
                embedding_model_profile = selectAPI(this.profile.embedding);
            } catch (e) {
                embedding_model_profile = null;
            }
        }
        if (embedding_model_profile) {
            this.embedding_model = createModel(embedding_model_profile);
        }
        else {
            this.embedding_model = createModel({api: chat_model_profile.api});
        }

        this.skill_libary = new SkillLibrary(agent, this.embedding_model);
        mkdirSync(`./bots/${name}`, { recursive: true });
        writeFileSync(`./bots/${name}/last_profile.json`, JSON.stringify(this.profile, null, 4), (err) => {
            if (err) {
                throw new Error('Failed to save profile:', err);
            }
            console.log("Copy profile saved.");
        });
    }

    getName() {
        return this.profile.name;
    }

    getInitModes() {
        return this.profile.modes;
    }

    async initExamples() {
        try {
            this.convo_examples = new Examples(this.embedding_model, settings.num_examples);
            this.coding_examples = new Examples(this.embedding_model, settings.num_examples);
            
            // Wait for both examples to load before proceeding
            await Promise.all([
                this.convo_examples.load(this.profile.conversation_examples),
                this.coding_examples.load(this.profile.coding_examples),
                this.skill_libary.initSkillLibrary()
            ]).catch(error => {
                // Preserve error details
                console.error('Failed to initialize examples. Error details:', error);
                console.error('Stack trace:', error.stack);
                throw error;
            });

            console.log('Examples initialized.');
        } catch (error) {
            console.error('Failed to initialize examples:', error);
            console.error('Stack trace:', error.stack);
            throw error; // Re-throw with preserved details
        }
    }

    async replaceStrings(prompt, messages, examples=null, to_summarize=[], last_goals=null, expressionContext=null) {
        prompt = prompt.replaceAll('$NAME', this.agent.name);

        // ═══ Persona Engine placeholders ═══
        if (prompt.includes('$PERSONA')) {
            prompt = prompt.replaceAll('$PERSONA',
                (this.agent.persona?.buildPrompt() || '') + '\n' +
                (this.agent.persona?.buildMemoryPrompt(this.agent.currentWorldId) || ''));
        }
        // V5-Converged: Minimal Expression Persona (identity + voice + core principles only)
        if (prompt.includes('$EXPRESSION_PERSONA')) {
            prompt = prompt.replaceAll('$EXPRESSION_PERSONA',
                this.agent.persona?.buildExpressionPrompt() || '');
        }
        // V5-Converged: Relationship context for Expression LLM
        if (prompt.includes('$RELATIONSHIP_CONTEXT')) {
            const relCtx = expressionContext?.relationshipContext;
            if (relCtx) {
                prompt = prompt.replaceAll('$RELATIONSHIP_CONTEXT',
                    `[RELATIONSHIP CONTEXT] You have known this player for ${relCtx.daysKnown} days ` +
                    `(${relCtx.interactions} interactions, trust=${relCtx.trust.toFixed(2)}). ` +
                    `Your phase: ${relCtx.phase}.`);
            } else {
                prompt = prompt.replaceAll('$RELATIONSHIP_CONTEXT', '');
            }
        }
        if (prompt.includes('$MEMORY_RULES')) {
            prompt = prompt.replaceAll('$MEMORY_RULES', MEMORY_HIERARCHY_RULES);
        }
        if (prompt.includes('$INTENT') && this.agent.persona?.activeBehavior?.intent) {
            const i = this.agent.persona.activeBehavior.intent;
            prompt = prompt.replaceAll('$INTENT',
                `[CURRENT INTENT] Type: ${i.type}. Urgency: ${i.urgency.toFixed(1)}. ` +
                `Emotion: ${i.emotion}. ${i.reason ? 'Reason: ' + i.reason + '.' : ''}`);
        } else if (prompt.includes('$INTENT')) {
            prompt = prompt.replaceAll('$INTENT', '');
        }
        if (prompt.includes('$ACTION_PLAN') && this.agent.persona?.activeBehavior?.plan) {
            const p = this.agent.persona.activeBehavior.plan;
            let planText = `[ACTION PLAN] Primary: ${p.primary_action}. `;
            if (p.suggested_action) {
                planText += `Proposed action: ${JSON.stringify(p.suggested_action)}. `;
            }
            planText += `${p.narration_hint ? 'How to express: ' + p.narration_hint + '. ' : ''}`;
            planText += `Sub-actions: ${p.sub_actions.join(' → ') || 'none'}. `;
            planText += `Will remember: ${p.memory_write ? 'yes' : 'no'}.`;
            prompt = prompt.replaceAll('$ACTION_PLAN', planText);
        } else if (prompt.includes('$ACTION_PLAN')) {
            prompt = prompt.replaceAll('$ACTION_PLAN', '');
        }

        if (prompt.includes('$STATS')) {
            let stats = await getCommand('!stats').perform(this.agent) + '\n';
            stats += await getCommand('!entities').perform(this.agent) + '\n';
            stats += await getCommand('!nearbyBlocks').perform(this.agent);
            prompt = prompt.replaceAll('$STATS', stats);
        }
        if (prompt.includes('$INVENTORY')) {
            let inventory = await getCommand('!inventory').perform(this.agent);
            prompt = prompt.replaceAll('$INVENTORY', inventory);
        }
        if (prompt.includes('$ACTION')) {
            prompt = prompt.replaceAll('$ACTION', this.agent.actions.currentActionLabel);
        }
        if (prompt.includes('$COMMAND_DOCS'))
            prompt = prompt.replaceAll('$COMMAND_DOCS', getCommandDocs(this.agent));
        if (prompt.includes('$CODE_DOCS')) {
            const code_task_content = messages.slice().reverse().find(msg =>
                msg.role !== 'system' && msg.content.includes('!newAction(')
            )?.content?.match(/!newAction\((.*?)\)/)?.[1] || '';

            prompt = prompt.replaceAll(
                '$CODE_DOCS',
                await this.skill_libary.getRelevantSkillDocs(code_task_content, settings.relevant_docs_count)
            );
        }
        if (prompt.includes('$EXAMPLES') && examples !== null)
            prompt = prompt.replaceAll('$EXAMPLES', await examples.createExampleMessage(messages));
        if (prompt.includes('$MEMORY'))
            prompt = prompt.replaceAll('$MEMORY', this.agent.history.memory);

        // V5 Reality Layer — ground truth from World State Manager
        if (prompt.includes('$REALITY_RULES')) {
            const wsm = this.agent.observer?.worldState;
            const rules = wsm?.realityGuard?.buildGuardPrompt(
                wsm.actionLog
            ) || '';
            prompt = prompt.replaceAll('$REALITY_RULES', rules);
            // [TRACE] Log expanded $REALITY_RULES
            console.log('[TRACE:REALITY_RULES]', JSON.stringify({
                placeholder: '$REALITY_RULES',
                expanded_length: rules.length,
                expanded_text: rules,
            }));
        }
        if (prompt.includes('$ACTION_LOG')) {
            const wsm = this.agent.observer?.worldState;
            const log = wsm?.actionLog?.formatForPrompt(5) ||
                'No actions performed yet.';
            prompt = prompt.replaceAll('$ACTION_LOG', log);
            // [TRACE] Log expanded $ACTION_LOG
            console.log('[TRACE:ACTION_LOG]', JSON.stringify({
                placeholder: '$ACTION_LOG',
                expanded_text: log,
            }));
        }

        // ═══ V5 Reality Boundary — expression constraints ═══
        // Only injected when expressionContext is provided (Expression path).
        if (prompt.includes('$REALITY_BOUNDARY')) {
            if (expressionContext && expressionContext.decisionContext !== 'chat') {
                prompt = prompt.replaceAll('$REALITY_BOUNDARY', REALITY_BOUNDARY);
            } else {
                prompt = prompt.replaceAll('$REALITY_BOUNDARY', '');
            }
        }

        // ═══ V5 Expression Context — action result + decision + speech hint ═══
        if (prompt.includes('$ACTION_RESULT')) {
            const actionResult = expressionContext?.actionResult || '';
            if (actionResult) {
                prompt = prompt.replaceAll('$ACTION_RESULT',
                    `[ACTION RESULT — What Just Happened]\n${actionResult}`);
            } else {
                prompt = prompt.replaceAll('$ACTION_RESULT', '');
            }
        }
        if (prompt.includes('$DECISION_CONTEXT')) {
            const decisionContext = expressionContext?.decisionContext || 'chat';
            if (decisionContext !== 'chat') {
                const reason = expressionContext?.decisionReason || '';
                const reasonText = reason ? ` Reason: ${reason}.` : '';
                prompt = prompt.replaceAll('$DECISION_CONTEXT',
                    `[DECISION CONTEXT] Persona decided: ${decisionContext}.${reasonText} Describe this in your character's voice.`);
            } else {
                prompt = prompt.replaceAll('$DECISION_CONTEXT', '');
            }
        }
        if (prompt.includes('$SPEECH_HINT')) {
            const speechHint = expressionContext?.speechHint || '';
            if (speechHint) {
                prompt = prompt.replaceAll('$SPEECH_HINT',
                    `[SPEECH DIRECTION] ${speechHint}.`);
            } else {
                prompt = prompt.replaceAll('$SPEECH_HINT', '');
            }
        }

        // [TRACE] Log memory content when injected
        if (prompt.includes('$MEMORY')) {
            console.log('[TRACE:MEMORY_INJECT]', JSON.stringify({
                memory_length: (this.agent.history?.memory || '').length,
                memory_snippet: (this.agent.history?.memory || '').slice(0, 300),
            }));
        }

        if (prompt.includes('$TO_SUMMARIZE'))
            prompt = prompt.replaceAll('$TO_SUMMARIZE', stringifyTurns(to_summarize));
        if (prompt.includes('$CONVO'))
            prompt = prompt.replaceAll('$CONVO', 'Recent conversation:\n' + stringifyTurns(messages));
        if (prompt.includes('$SELF_PROMPT')) {
            // if active or paused, show the current goal
            let self_prompt = !this.agent.self_prompter.isStopped() ? `YOUR CURRENT ASSIGNED GOAL: "${this.agent.self_prompter.prompt}"\n` : '';
            prompt = prompt.replaceAll('$SELF_PROMPT', self_prompt);
        }
        if (prompt.includes('$LAST_GOALS')) {
            let goal_text = '';
            for (let goal in last_goals) {
                if (last_goals[goal])
                    goal_text += `You recently successfully completed the goal ${goal}.\n`
                else
                    goal_text += `You recently failed to complete the goal ${goal}.\n`
            }
            prompt = prompt.replaceAll('$LAST_GOALS', goal_text.trim());
        }
        if (prompt.includes('$BLUEPRINTS')) {
            if (this.agent.npc.constructions) {
                let blueprints = '';
                for (let blueprint in this.agent.npc.constructions) {
                    blueprints += blueprint + ', ';
                }
                prompt = prompt.replaceAll('$BLUEPRINTS', blueprints.slice(0, -2));
            }
        }

        // check if there are any remaining placeholders with syntax $<word>
        let remaining = prompt.match(/\$[A-Z_]+/g);
        if (remaining !== null) {
            console.warn('Unknown prompt placeholders:', remaining.join(', '));
        }
        return prompt;
    }

    async checkCooldown() {
        let elapsed = Date.now() - this.last_prompt_time;
        if (elapsed < this.cooldown && this.cooldown > 0) {
            await new Promise(r => setTimeout(r, this.cooldown - elapsed));
        }
        this.last_prompt_time = Date.now();
    }

    async promptConvo(messages, expressionContext=null) {
        this.most_recent_msg_time = Date.now();
        let current_msg_time = this.most_recent_msg_time;

        for (let i = 0; i < 3; i++) { // try 3 times to avoid hallucinations
            await this.checkCooldown();
            if (current_msg_time !== this.most_recent_msg_time) {
                return '';
            }

            let prompt = this.profile.conversing;

            // ═══ V5-Converged: Strip Expression-only placeholders from chat path ═══
            // NOTE: $COMMAND_DOCS is kept so the chat-path LLM can emit correct
            // !command syntax as a fallback (executed via the chat path's Persona Gate).
            prompt = prompt.replace('$EXAMPLES\n', '').replace('$EXAMPLES', '');

            // ═══ V5-Converged Expression Path ═══
            if (expressionContext && expressionContext.decisionContext !== 'chat') {
                // Inject REALITY_BOUNDARY constraints at the top of the prompt
                prompt = REALITY_BOUNDARY + '\n\n' + prompt;
                // Remove full $PERSONA — use $EXPRESSION_PERSONA (minimal: identity + voice + principles)
                prompt = prompt.replace('$PERSONA\n', '').replace('$PERSONA', '');
                // Remove $REALITY_RULES — Expression LLM must NEVER see !command permission.
                // (REALITY_RULES says "use !command syntax" — a legacy of the single-phase pipeline.)
                prompt = prompt.replace('$REALITY_RULES\n', '').replace('$REALITY_RULES', '');
            } else {
                // Chat path: remove Expression-only placeholders
                prompt = prompt.replace('$EXPRESSION_PERSONA\n', '').replace('$EXPRESSION_PERSONA', '');
                prompt = prompt.replace('$RELATIONSHIP_CONTEXT\n', '').replace('$RELATIONSHIP_CONTEXT', '');
            }

            prompt = await this.replaceStrings(prompt, messages, this.convo_examples, [], null, expressionContext);

            // [TRACE] Log the FINAL assembled prompt + messages sent to LLM
            console.log('[TRACE:FINAL_PROMPT]', JSON.stringify({
                attempt: i+1,
                system_prompt_length: prompt.length,
                system_prompt: prompt,
                message_count: messages.length,
                messages: messages.map(m => ({
                    role: m.role,
                    content_snippet: String(m.content||'').slice(0, 200),
                    content_length: String(m.content||'').length,
                })),
            }));

            let generation;

            try {
                generation = await this.chat_model.sendRequest(messages, prompt);
                if (typeof generation !== 'string') {
                    console.error('Error: Generated response is not a string', generation);
                    throw new Error('Generated response is not a string');
                }
                console.log("Generated response:", generation);
                await this._saveLog(prompt, messages, generation, 'conversation');

            } catch (error) {
                console.error('Error during message generation or file writing:', error);
                continue;
            }

            // Check for hallucination or invalid output
            if (generation?.includes('(FROM OTHER BOT)')) {
                console.warn('LLM hallucinated message as another bot. Trying again...');
                continue;
            }

            if (current_msg_time !== this.most_recent_msg_time) {
                console.warn(`${this.agent.name} received new message while generating, discarding old response.`);
                return '';
            }

            if (generation?.includes('</think>')) {
                const [_, afterThink] = generation.split('</think>')
                generation = afterThink
            }

            return generation;
        }

        return '';
    }

    /**
     * V5 Cognitive Phase — propose action based on player intent.
     * Uses the `cognitive` profile prompt. Output is structured JSON, not player-visible text.
     *
     * @param {Array} messages — conversation history
     * @returns {string} — raw LLM output (expected to be JSON)
     */
    async promptCognitive(messages) {
        await this.checkCooldown();
        if (!this.profile.cognitive) {
            console.warn('[COGNITIVE] No cognitive profile field — falling back to single-phase');
            return '';
        }
        let prompt = this.profile.cognitive;
        prompt = await this.replaceStrings(prompt, messages, null); // no conversation examples for Cognitive
        console.log('[TRACE:COGNITIVE_PROMPT]', JSON.stringify({
            prompt_length: prompt.length,
            prompt_snippet: prompt.slice(0, 300),
        }));
        let generation = await this.chat_model.sendRequest(messages, prompt);
        console.log('[COGNITIVE] Raw output:', generation);
        await this._saveLog(prompt, messages, generation, 'cognitive');
        return generation;
    }

    async promptCoding(messages) {
        if (this.awaiting_coding) {
            console.warn('Already awaiting coding response, returning no response.');
            return '```//no response```';
        }
        this.awaiting_coding = true;
        await this.checkCooldown();
        let prompt = this.profile.coding;
        prompt = await this.replaceStrings(prompt, messages, this.coding_examples);

        let resp = await this.code_model.sendRequest(messages, prompt);
        this.awaiting_coding = false;
        await this._saveLog(prompt, messages, resp, 'coding');
        return resp;
    }

    async promptMemSaving(to_summarize) {
        await this.checkCooldown();
        let prompt = this.profile.saving_memory;
        prompt = await this.replaceStrings(prompt, null, null, to_summarize);
        let resp = await this.chat_model.sendRequest([], prompt);
        await this._saveLog(prompt, to_summarize, resp, 'memSaving');
        if (resp?.includes('</think>')) {
            const [_, afterThink] = resp.split('</think>')
            resp = afterThink;
        }
        return resp;
    }

    async promptShouldRespondToBot(new_message) {
        await this.checkCooldown();
        let prompt = this.profile.bot_responder;
        let messages = this.agent.history.getHistory();
        messages.push({role: 'user', content: new_message});
        prompt = await this.replaceStrings(prompt, null, null, messages);
        let res = await this.chat_model.sendRequest([], prompt);
        return res.trim().toLowerCase() === 'respond';
    }

    async promptVision(messages, imageBuffer) {
        await this.checkCooldown();
        let prompt = this.profile.image_analysis;
        prompt = await this.replaceStrings(prompt, messages, null, null, null);
        return await this.vision_model.sendVisionRequest(messages, prompt, imageBuffer);
    }

    async promptGoalSetting(messages, last_goals) {
        // deprecated
        let system_message = this.profile.goal_setting;
        system_message = await this.replaceStrings(system_message, messages);

        let user_message = 'Use the below info to determine what goal to target next\n\n';
        user_message += '$LAST_GOALS\n$STATS\n$INVENTORY\n$CONVO'
        user_message = await this.replaceStrings(user_message, messages, null, null, last_goals);
        let user_messages = [{role: 'user', content: user_message}];

        let res = await this.chat_model.sendRequest(user_messages, system_message);

        let goal = null;
        try {
            let data = res.split('```')[1].replace('json', '').trim();
            goal = JSON.parse(data);
        } catch (err) {
            console.log('Failed to parse goal:', res, err);
        }
        if (!goal || !goal.name || !goal.quantity || isNaN(parseInt(goal.quantity))) {
            console.log('Failed to set goal:', res);
            return null;
        }
        goal.quantity = parseInt(goal.quantity);
        return goal;
    }

    async _saveLog(prompt, messages, generation, tag) {
        if (!settings.log_all_prompts)
            return;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        let logEntry;
        let task_id = this.agent.task.task_id;
        if (task_id == null) {
            logEntry = `[${timestamp}] \nPrompt:\n${prompt}\n\nConversation:\n${JSON.stringify(messages, null, 2)}\n\nResponse:\n${generation}\n\n`;
        } else {
            logEntry = `[${timestamp}] Task ID: ${task_id}\nPrompt:\n${prompt}\n\nConversation:\n${JSON.stringify(messages, null, 2)}\n\nResponse:\n${generation}\n\n`;
        }
        const logFile = `${tag}_${timestamp}.txt`;
        await this._saveToFile(logFile, logEntry);
    }

    async _saveToFile(logFile, logEntry) {
        let task_id = this.agent.task.task_id;
        let logDir;
        if (task_id == null) {
            logDir = path.join(__dirname, `../../bots/${this.agent.name}/logs`);
        } else {
            logDir = path.join(__dirname, `../../bots/${this.agent.name}/logs/${task_id}`);
        }

        await fs.mkdir(logDir, { recursive: true });

        logFile = path.join(logDir, logFile);
        await fs.appendFile(logFile, String(logEntry), 'utf-8');
    }
}
