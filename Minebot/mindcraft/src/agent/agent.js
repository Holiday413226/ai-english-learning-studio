import { History } from './history.js';
import { Coder } from './coder.js';
import { VisionInterpreter } from './vision/vision_interpreter.js';
import { VisionPerception } from './vision/perception.js';
import { Observer } from './observation/observer.js';
import { Prompter } from '../models/prompter.js';
import { initModes } from './modes.js';
import { initBot } from '../utils/mcdata.js';
import { containsCommand, commandExists, executeCommand, truncCommandMessage, isAction, blacklistCommands, parseCommandMessage } from './commands/index.js';
import { actionToCommand, commandToAction, parseActionProposal } from './action_executor.js';
import { ActionManager } from './action_manager.js';
import { NPCContoller } from './npc/controller.js';
import { MemoryBank } from './memory_bank.js';
import { SelfPrompter } from './self_prompter.js';
import convoManager from './conversation.js';
import { Persona } from './persona.js';
import { loadPersonaData } from './persona_store.js';
import { handleTranslation, handleEnglishTranslation } from '../utils/translator.js';
import { addBrowserViewer } from './vision/browser_viewer.js';
import { serverProxy, sendOutputToServer } from './mindserver_proxy.js';
import settings from './settings.js';
import { Task } from './tasks/tasks.js';
import { speak } from './speak.js';
import { log, validateNameFormat, handleDisconnection } from './connection_handler.js';

// ---------------------------------------------------------------------------
// LLMGate — single-entry concurrency gate for LLM calls.
// Guarantees at most 1 handleMessage in flight.  800ms throttle for autonomous
// triggers (reflex / background).  Dedup for reflex events only.
// Interactive triggers (player/bot/death/init) bypass throttle and dedup.
// ---------------------------------------------------------------------------
class LLMGate {
    constructor() {
        this.inFlight = false;
        this.lastReflexTime = 0;
        this.lastKey = '';
        this._next = null;
        this._pendingTime = 0;
    }

    async run(fn, opts = {}) {
        const { throttled = false, dedupKey = '' } = opts;
        const now = Date.now();

        if (throttled && now - this.lastReflexTime < 800) return null;
        if (dedupKey && dedupKey === this.lastKey && now - this.lastReflexTime < 800) return null;

        if (this.inFlight) {
            if (this._next) this._next.resolve?.(null);
            this._next = { fn, resolve: null };
            this._pendingTime = now;
            return new Promise(r => { this._next.resolve = r; });
        }

        if (throttled) this.lastReflexTime = now;
        if (dedupKey) this.lastKey = dedupKey;
        return this._exec(fn);
    }

    async _exec(fn) {
        this.inFlight = true;
        try { return await fn(); }
        finally {
            this.inFlight = false;
            if (this._next) {
                if (Date.now() - this._pendingTime > 3000) {
                    this._next.resolve?.(null);
                    this._next = null;
                } else {
                    const n = this._next; this._next = null;
                    try { const r = await this._exec(n.fn); n.resolve?.(r); }
                    catch { n.resolve?.(null); }
                }
            }
        }
    }

    static hashKey(type, prompt) {
        return type + '|' + (prompt || '').slice(0, 80).replace(/\s+/g, ' ').trim();
    }

    // Instance wrapper so external callers (observer, conversation) can use
    // this.agent.llmGate.hashKey(...) without referencing the class by name.
    hashKey(type, prompt) {
        return LLMGate.hashKey(type, prompt);
    }
}

// ═══ V5 Expression Reality Guard — lightweight fabrication detection ═══
// Runs after Expression LLM generation, before routeResponse.
// See plan: mindcraft-ai-companion-noble-parnas.md § Risk 2 Fix B

const FABRICATION_PATTERNS = [
    { pattern: /我(更|越来越|开始|已经)?(信任|相信|依赖)(你|他|她)/, label: 'fabricated trust' },
    { pattern: /(你|他|她)(是|成为)(我的|了)?(朋友|伙伴|同伴|重要的人)/, label: 'fabricated relationship' },
    { pattern: /我(感到|觉得|变得)(更|越来越|开始)?(亲近|靠近|依赖|喜欢)/, label: 'fabricated emotion' },
    { pattern: /我(会|将)(永远|一直|始终)(跟随|陪伴|保护|帮助)(你|他|她)/, label: 'fabricated promise' },
    { pattern: /我(正在|开始|逐渐)(学会|懂得|理解|变得)/, label: 'fabricated development' },
];

function validateExpression(text) {
    if (!text || typeof text !== 'string') return { valid: true };
    for (const { pattern, label } of FABRICATION_PATTERNS) {
        if (pattern.test(text)) {
            return { valid: false, label };
        }
    }
    return { valid: true };
}

export class Agent {
    async start(load_mem=false, init_message=null, count_id=0) {
        this.last_sender = null;
        this.count_id = count_id;
        this._disconnectHandled = false;
        this.currentWorldId = `${settings.host}:${settings.port}`;

        // Initialize components
        this.actions = new ActionManager(this);
        this.prompter = new Prompter(this, settings.profile);
        this.name = (this.prompter.getName() || '').trim();
        console.log(`Initializing agent ${this.name}...`);
        
        // Validate Name Format
        // connection_handler now ensures the message has [LoginGuard] prefix
        const nameCheck = validateNameFormat(this.name);
        if (!nameCheck.success) {
            log(this.name, nameCheck.msg);
            process.exit(1);
            return;
        }
        
        this.history = new History(this);
        this.coder = new Coder(this);
        this.npc = new NPCContoller(this);
        this.memory_bank = new MemoryBank();
        this.self_prompter = new SelfPrompter(this);
        this.llmGate = new LLMGate();
        convoManager.initAgent(this);
        await this.prompter.initExamples();

        // ═══ Persona Engine — identity + intent + plan + drift ═══
        const personaId = this.prompter.profile.persona_id || this.name;
        const savedPersona = loadPersonaData(personaId);
        if (savedPersona) {
            this.persona = Persona.fromJSON(savedPersona);
            console.log(`[PERSONA] Loaded persona '${this.persona.id}' from disk`);
        } else {
            this.persona = new Persona(personaId, {
                name: this.name,
                identity: this.prompter.profile.identity,
                backstory: this.prompter.profile.backstory || settings.persona_backstory,
                voice_style: this.prompter.profile.voice_style,
                characterScript: this.prompter.profile.characterScript || settings.character_script,
                traits: this.prompter.profile.traits,
            });
            console.log(`[PERSONA] Created new persona '${this.persona.id}'`);
        }

        // load mem first before doing task
        let save_data = null;
        if (load_mem) {
            save_data = this.history.load();
        }
        let taskStart = null;
        if (save_data) {
            taskStart = save_data.taskStart;
        } else {
            taskStart = Date.now();
        }
        this.task = new Task(this, settings.task, taskStart);
        this.blocked_actions = settings.blocked_actions.concat(this.task.blocked_actions || []);
        blacklistCommands(this.blocked_actions);

        console.log(this.name, 'logging into minecraft...');
        this.bot = initBot(this.name);
        
        // Connection Handler
        const onDisconnect = (event, reason) => {
            if (this._disconnectHandled) return;
            this._disconnectHandled = true;

            // Log and Analyze
            // handleDisconnection handles logging to console and server
            const { type } = handleDisconnection(this.name, reason);

            process.exit(0);  // exit 0 = expected disconnect, triggers clean restart (not crash)
        };
        
        // Bind events
        this.bot.once('kicked', (reason) => onDisconnect('Kicked', reason));
        this.bot.once('end', (reason) => onDisconnect('Disconnected', reason));
        this.bot.on('error', (err) => {
            if (String(err).includes('Duplicate') || String(err).includes('ECONNREFUSED')) {
                 onDisconnect('Error', err);
            } else {
                 log(this.name, `[LoginGuard] Connection Error: ${String(err)}`);
            }
        });

        initModes(this);

        this.bot.on('login', () => {
            console.log(this.name, 'logged in!');
            serverProxy.login();
            
            // Set skin for profile, requires Fabric Tailor. (https://modrinth.com/mod/fabrictailor)
            if (this.prompter.profile.skin) {
                const skin = this.prompter.profile.skin;
                console.log(`[Skin] Applying skin: ${skin.model}\n${skin.url}`);
                this.bot.chat(`/skin set URL ${skin.model} ${skin.url}`);
            }
            else {
                console.log('[Skin] No custom skin configured.');
                this.bot.chat(`/skin clear`);
            }
        });
		const spawnTimeoutDuration = settings.spawn_timeout;
        const spawnTimeout = setTimeout(() => {
            const msg = `Bot has not spawned after ${spawnTimeoutDuration} seconds. Exiting.`;
            log(this.name, msg);
            process.exit(1);
        }, spawnTimeoutDuration * 1000);
        this.bot.once('spawn', async () => {
            try {
                clearTimeout(spawnTimeout);
                addBrowserViewer(this.bot, count_id);
                console.log('Initializing vision intepreter...');
                this.vision_interpreter = new VisionInterpreter(this, settings.allow_vision);
                // Vision perception layer — semantic environmental labels, does NOT feed LLM
                this.vision_perception = new VisionPerception(this);
                // Event-driven observation system — detects world changes and enriches dialogue context
                this.observer = new Observer(this);

                // wait for a bit so stats are not undefined
                await new Promise((resolve) => setTimeout(resolve, 1000));
                
                console.log(`${this.name} spawned.`);
                this.clearBotLogs();
              
                this._setupEventHandlers(save_data, init_message);
                this.startEvents();
              
                if (!load_mem) {
                    if (settings.task) {
                        this.task.initBotTask();
                        this.task.setAgentGoal();
                    }
                } else {
                    // set the goal without initializing the rest of the task
                    if (settings.task) {
                        this.task.setAgentGoal();
                    }
                }

                await new Promise((resolve) => setTimeout(resolve, 10000));
                this.checkAllPlayersPresent();

            } catch (error) {
                console.error('Error in spawn event:', error);
                process.exit(0);
            }
        });
    }

    async _setupEventHandlers(save_data, init_message) {
        const ignore_messages = [
            "Set own game mode to",
            "Set the time to",
            "Set the difficulty to",
            "Teleported ",
            "Set the weather to",
            "Gamerule "
        ];
        
        const respondFunc = async (username, message) => {
            if (message === "") return;
            if (username === this.name) return;
            if (settings.only_chat_with.length > 0 && !settings.only_chat_with.includes(username)) return;
            try {
                if (ignore_messages.some((m) => message.startsWith(m))) return;

                this.shut_up = false;

                console.log(this.name, 'received message from', username, ':', message);

                if (convoManager.isOtherAgent(username)) {
                    console.warn('received whisper from other bot??')
                }
                else {
                    let translation = await handleEnglishTranslation(message);
                    this.llmGate.run(
                        () => this.handleMessage(username, translation)
                    ).catch(() => {});
                }
            } catch (error) {
                console.error('Error handling message:', error);
            }
        }

		this.respondFunc = respondFunc;

        this.bot.on('whisper', respondFunc);
        
        this.bot.on('chat', (username, message) => {
            if (serverProxy.getNumOtherAgents() > 0) return;
            // only respond to open chat messages when there are no other agents
            respondFunc(username, message);
        });

        // Set up auto-eat
        this.bot.autoEat.options = {
            priority: 'foodPoints',
            startAt: 14,
            bannedFood: ["rotten_flesh", "spider_eye", "poisonous_potato", "pufferfish", "chicken"]
        };

        if (save_data?.self_prompt) {
            if (init_message) {
                this.history.add('system', init_message);
            }
            await this.self_prompter.handleLoad(save_data.self_prompt, save_data.self_prompting_state);
        }
        if (save_data?.last_sender) {
            this.last_sender = save_data.last_sender;
            if (convoManager.otherAgentInGame(this.last_sender)) {
                const msg_package = {
                    message: `You have restarted and this message is auto-generated. Continue the conversation with me.`,
                    start: true
                };
                convoManager.receiveFromBot(this.last_sender, msg_package);
            }
        }
        else if (init_message) {
            await this.llmGate.run(
                () => this.handleMessage('system', init_message, 2)
            );
        }
        else {
            this.openChat("Hello world! I am "+this.name);
        }
    }

    checkAllPlayersPresent() {
        if (!this.task || !this.task.agent_names) {
          return;
        }

        const missingPlayers = this.task.agent_names.filter(name => !this.bot.players[name]);
        if (missingPlayers.length > 0) {
            console.log(`Missing players/bots: ${missingPlayers.join(', ')}`);
            this.cleanKill('Not all required players/bots are present in the world. Exiting.', 4);
        }
    }

    requestInterrupt() {
        this.bot.interrupt_code = true;
        this.bot.stopDigging();
        this.bot.collectBlock.cancelTask();
        this.bot.pathfinder.stop();
        this.bot.pvp.stop();
    }

    clearBotLogs() {
        this.bot.output = '';
        this.bot.interrupt_code = false;
    }

    shutUp() {
        this.shut_up = true;
        if (this.self_prompter.isActive()) {
            this.self_prompter.stop(false);
        }
        convoManager.endAllConversations();
    }

    async handleMessage(source, message, max_responses=null) {
        await this.checkTaskDone();
        if (!source || !message) {
            console.warn('Received empty message from', source);
            return false;
        }

        let used_command = false;
        if (max_responses === null) {
            max_responses = settings.max_commands === -1 ? Infinity : settings.max_commands;
        }
        if (max_responses === -1) {
            max_responses = Infinity;
        }

        const self_prompt = source === 'system' || source === this.name;
        const from_other_bot = convoManager.isOtherAgent(source);

        if (!self_prompt && !from_other_bot) { // Developer/Admin path — direct !command bypasses Persona
            const user_command_name = containsCommand(message);
            if (user_command_name) {
                if (!commandExists(user_command_name)) {
                    this.routeResponse(source, `Command '${user_command_name}' does not exist.`);
                    return false;
                }
                this.routeResponse(source, `*${source} used ${user_command_name.substring(1)}*`);
                if (user_command_name === '!newAction') {
                    // all user-initiated commands are ignored by the bot except for this one
                    // add the preceding message to the history to give context for newAction
                    this.history.add(source, message);
                }
                let execute_res = await executeCommand(this, message);
                if (execute_res) 
                    this.routeResponse(source, execute_res);
                return true;
            }
        }

        if (from_other_bot)
            this.last_sender = source;

        // Now translate the message
        message = await handleEnglishTranslation(message);
        console.log('received message from', source, ':', message);

        const checkInterrupt = () => this.self_prompter.shouldInterrupt(self_prompt) || this.shut_up || convoManager.responseScheduledFor(source);
        
        let behavior_log = this.bot.modes.flushBehaviorLog().trim();
        if (behavior_log.length > 0) {
            const MAX_LOG = 500;
            if (behavior_log.length > MAX_LOG) {
                behavior_log = '...' + behavior_log.substring(behavior_log.length - MAX_LOG);
            }
            behavior_log = 'Recent behaviors log: \n' + behavior_log;
            await this.history.add('system', behavior_log);
        }

        // Inject pending observation context (sunrise, biome change, etc.)
        // as system context so the LLM can naturally weave observations into replies.
        if (!self_prompt) {
            await this.observer?.injectQueueToHistory();
        }

        // ═══ Persona Behavior Pipeline — intent + plan before LLM ═══
        // Persona decides WHAT to do; LLM only decides HOW to say it.
        // Applies to ALL trigger sources including system events (init, death, etc.)
        if (this.persona) {
            // Track player relationship on each interaction
            if (!self_prompt && source && source !== 'system') {
                this.persona.updateRelationship(source);
            }
            const { intent, plan } = this.persona.generateBehavior(message, {
                type: self_prompt ? 'system_event' : 'player_message',
                source,
                importance: self_prompt ? 0.7 : 0.8
            });
            this.persona.setActiveBehavior(intent, plan);
            if (plan.primary_action === 'ignore') {
                console.log('[PERSONA] Intent=ignore, skipping LLM call');
                return false;
            }
        }

        // Handle other user messages
        await this.history.add(source, message);
        this.history.save();

        // [TRACE] Log when handleMessage is called for system/auto-speech
        if (self_prompt) {
            console.log('[TRACE:SYSTEM_HANDLE]', JSON.stringify({
                source: source,
                message_snippet: message.slice(0, 200),
                message_length: message.length,
                history_size: this.history.getHistory().length,
                is_idle: this.isIdle(),
                shut_up: this.shut_up,
                self_prompter_active: this.self_prompter?.isActive(),
                observer_queue_size: this.observer?.active_queue?.length,
            }));
        }

        if (!self_prompt && this.self_prompter.isActive()) // message is from user during self-prompting
            max_responses = 1; // force only respond to this message, then let self-prompting take over
        for (let i=0; i<max_responses; i++) {
            if (checkInterrupt()) break;
            let history = this.history.getHistory();

            // ═══════════════════════════════════════════════════════════════
            // V5-CONVERGED: Universal entry — Cognitive LLM for ALL player msgs
            // ═══════════════════════════════════════════════════════════════
            if (!self_prompt && source && source !== 'system') {

                // ═══ Pause autonomous modes during player-requested action pipeline ═══
                // Prevents hunting/item_collecting/etc. from firing during LLM calls
                // and interrupting the player's command before it starts executing.
                const AUTONOMOUS_MODES = ['hunting', 'item_collecting', 'torch_placing', 'elbow_room'];
                for (const m of AUTONOMOUS_MODES) {
                    if (this.bot.modes.isOn(m)) this.bot.modes.pause(m);
                }

                // ── Cognitive: Intent Recognition (lightweight, no $PERSONA) ──
                console.log('[V5:COGNITIVE] Calling Cognitive LLM...');
                let cognitiveRes = await this.prompter.promptCognitive(history);
                console.log('[V5:COGNITIVE] Output length:', cognitiveRes?.length || 0,
                    '| Snippet:', String(cognitiveRes).slice(0, 300).replace(/\n/g, '\\n'));

                let proposal = (cognitiveRes && cognitiveRes.trim().length > 0)
                    ? parseActionProposal(cognitiveRes) : null;

                if (!proposal) {
                    console.log('[V5:COGNITIVE] parseActionProposal returned null — falling to chat path');
                } else if (proposal.type === 'chat') {
                    console.log('[V5:COGNITIVE] Cognitive returned chat intent — no action to execute');
                }

                if (proposal && proposal.type === 'action' && proposal.action?.type) {
                    console.log('[V5:COGNITIVE] Proposed action:', JSON.stringify(proposal.action));

                    // ── Persona Decision Gate (with runtime context) ──
                    const decision = this.persona
                        ? this.persona.evaluateWithContext(proposal.action, {
                            source,
                            worldState: this.observer?.worldState?.summarize?.(),
                          })
                        : { decision: 'accept', reason: 'No persona.', speech_hint: '', runtime_context: null };

                    let actionResult = '';
                    let executed = false;

                    switch (decision.decision) {
                        case 'accept':
                        case 'modify': {
                            const action = decision.action || proposal.action;
                            const cmd = actionToCommand(action);
                            if (cmd) {
                                console.log(`[V5] Persona ${decision.decision}ed: ${action.type} → ${cmd} (${decision.reason})`);
                                this.history.add('system', `[Action planned: ${action.type} ${action.target || ''}]`);
                                // V5-FIX: Describe pending action for Expression LLM,
                                // defer actual execution to avoid blocking on endless actions.
                                // IMPORTANT: No raw !command text — prevents Expression LLM from
                                // hallucinating fake !command syntax in chat output.
                                const amountHint = action.params?.amount ? ` (amount: ${action.params.amount})` : '';
                                actionResult = `About to ${action.type} ${action.target || ''}${amountHint}.`;
                                executed = true;
                                used_command = true;
                            } else {
                                console.warn(`[V5] actionToCommand returned null for:`, action);
                                actionResult = `Unable to execute ${action.type}.`;
                                this.history.add('system', actionResult);
                            }
                            break;
                        }
                        case 'reject':
                        case 'hesitate':
                            console.log(`[V5] Persona ${decision.decision}ed: ${proposal.action.type} — ${decision.reason}`);
                            // V3-FIX: Override speech hint with explicit refusal instruction.
                            // Without this, Expression LLM role-play tendencies cause "OK I'll follow"
                            // despite the Gate having decided NOT to execute the action.
                            decision.speech_hint = `MUST_DECLINE: Persona decided to ${decision.decision} this request. ` +
                                `You must state your refusal or hesitation briefly in character. ` +
                                `Do NOT say anything that sounds like you are doing the action.`;
                            decision.reason = `Player requested: ${proposal.action.type} ${proposal.action.target || ''}. ` +
                                `Decision: ${decision.decision}. Why: ${decision.reason}.`;
                            actionResult = `${decision.decision}: ${decision.reason}`;
                            this.history.add('system',
                                `[Persona ${decision.decision}ed ${proposal.action.type}: ${decision.reason}]`);
                            break;
                    }

                    // ── Expression LLM (minimal Profile + Runtime State) ──
                    // V5-FIX: Expression runs BEFORE command execution so player gets immediate feedback.
                    let expressionRes = await this.prompter.promptConvo(history, {
                        actionResult,
                        decisionContext: decision.decision,
                        decisionReason: decision.reason,
                        relationshipContext: decision.runtime_context?.relationship || null,
                        speechHint: decision.speech_hint || '',
                    });

                    console.log(`${this.name} expression to ${source}: ""${expressionRes}""`);

                    // Reality Guard — debug logging only
                    const guard = validateExpression(expressionRes);
                    if (!guard.valid) {
                        console.warn(`[REALITY_GUARD:DEBUG] Detected ${guard.label} in expression: "${String(expressionRes).slice(0, 100)}"`);
                    }

                    if (expressionRes && expressionRes.trim().length > 0) {
                        this.history.add(this.name, expressionRes);
                        this.routeResponse(source, expressionRes);
                    }

                    // V5-FIX: Fire-and-forget command execution AFTER expression is sent.
                    // Prevents blocking on resume-based endless actions (followPlayer, goToPlayer, etc.)
                    if (executed) {
                        const action = decision.action || proposal.action;
                        const cmd = actionToCommand(action);
                        if (cmd) {
                            executeCommand(this, cmd).then(result => {
                                if (result) this.history.add('system', result);
                                console.log('Agent executed:', cmd, 'and got:', result);
                            }).catch(err => {
                                console.error('Agent execution error:', err);
                            });
                        }
                    }

                    this.self_prompter.handleUserPromptedCmd(self_prompt, executed);
                    this.history.save();
                    // Resume autonomous modes now that action is executing (or failed to start).
                    // Modes with interrupts removed won't interrupt the running action.
                    for (const m of AUTONOMOUS_MODES) {
                        this.bot.modes.unpause(m);
                    }
                    break; // Exit loop — action handled
                }

                // ── Chat Path: Cognitive returned {type:"chat"} or parse failed ──
                // Single LLM call with full Profile — no !command capability.
                let res = await this.prompter.promptConvo(history);

                console.log(`${this.name} full response to ${source}: ""${res}""`);

                if (res.trim().length === 0) {
                    console.warn('no response');
                    for (const m of AUTONOMOUS_MODES) {
                        this.bot.modes.unpause(m);
                    }
                    break;
                }

                // ── !command 兜底（镜像 system 路径 662-728）— 经 Persona Gate ──
                let command_name = containsCommand(res);
                if (command_name && commandExists(command_name)) {
                    res = truncCommandMessage(res);
                    const parsed = parseCommandMessage(res);
                    let rejected = false;
                    if (typeof parsed === 'object') {
                        const action = commandToAction(parsed.commandName, parsed.args);
                        if (action && this.persona) {
                            const decision = this.persona.evaluateActionProposal(action, { source });
                            if (decision.decision === 'reject' || decision.decision === 'hesitate') {
                                rejected = true;
                                console.log(`[PERSONA] Action ${decision.decision}ed: ${action.type} — ${decision.reason}`);
                                // 关键：不把原"答应"文本发出去，而是重新生成拒绝回复（言行一致）
                                decision.speech_hint = `MUST_DECLINE: Persona decided to ${decision.decision} this request. ` +
                                    `State your refusal or hesitation briefly in character. ` +
                                    `Do NOT say anything that sounds like you are doing the action.`;
                                decision.reason = `Player requested: ${action.type} ${action.target || ''}. ` +
                                    `Decision: ${decision.decision}. Why: ${decision.reason}.`;
                                let refusalRes = await this.prompter.promptConvo(history, {
                                    actionResult: `${decision.decision}: ${decision.reason}`,
                                    decisionContext: decision.decision,
                                    decisionReason: decision.reason,
                                    relationshipContext: this.persona?.getRelationship(source) || null,
                                    speechHint: decision.speech_hint,
                                });
                                this.history.add(this.name, refusalRes);
                                this.routeResponse(source, refusalRes);
                            } else if (decision.decision === 'modify') {
                                const newCmd = actionToCommand(decision.action);
                                if (newCmd) res = newCmd;
                            }
                        }
                    }
                    if (!rejected) {
                        // 只把命令前的口语（"……好。"）发给玩家，不泄露 !command 原文
                        let pre_message = res.substring(0, res.indexOf(command_name)).trim();
                        if (pre_message.length > 0) this.routeResponse(source, pre_message);
                        this.history.add(this.name, res);
                        this.self_prompter.handleUserPromptedCmd(self_prompt, isAction(command_name));
                        let execute_res = await executeCommand(this, res);
                        used_command = true;
                        if (execute_res) this.history.add('system', execute_res);
                    }
                } else {
                    this.history.add(this.name, res);
                    this.routeResponse(source, res);
                }
                this.history.save();
                // Resume autonomous modes on chat path
                for (const m of AUTONOMOUS_MODES) {
                    this.bot.modes.unpause(m);
                }
                break;
            }

            // ═══════════════════════════════════════════════════════════════
            // SYSTEM / SELF-PROMPT PATH — system events, autonomous prompts
            // ═══════════════════════════════════════════════════════════════
            let res = await this.prompter.promptConvo(history);

            console.log(`${this.name} full response to ${source}: ""${res}""`);

            if (self_prompt) {
                console.log('[TRACE:LLM_RESPONSE]', JSON.stringify({
                    source: source,
                    response_length: res.length,
                    response_trimmed_length: res.trim().length,
                    response_preview: res.slice(0, 200),
                    is_empty: res.trim().length === 0,
                    is_tab_only: res.trim() === '\t' || res === '\t',
                    attempt_in_loop: i,
                }));
            }

            if (res.trim().length === 0) {
                console.warn('no response')
                break;
            }

            // System path: post-hoc command interception for backward compat
            let command_name = containsCommand(res);
            if (command_name) {
                res = truncCommandMessage(res);
                this.history.add(this.name, res);

                if (!commandExists(command_name)) {
                    this.history.add('system', `Command ${command_name} does not exist.`);
                    console.warn('Agent hallucinated command:', command_name)
                    continue;
                }

                if (this.persona && !self_prompt) {
                    const parsed = parseCommandMessage(res);
                    if (typeof parsed === 'object') {
                        const action = commandToAction(parsed.commandName, parsed.args);
                        if (action) {
                            const decision = this.persona.evaluateActionProposal(action, {
                                source,
                                worldState: this.observer?.worldState?.summarize?.(),
                            });
                            switch (decision.decision) {
                                case 'reject':
                                case 'hesitate':
                                    console.log(`[PERSONA] Action ${decision.decision}ed: ${action.type} — ${decision.reason}`);
                                    this.history.add('system',
                                        `[Persona ${decision.decision}ed ${action.type}: ${decision.reason}]`);
                                    continue;
                                case 'modify':
                                    const newCmd = actionToCommand(decision.action);
                                    if (newCmd) res = newCmd;
                                    break;
                                case 'accept':
                                    break;
                            }
                        }
                    }
                }

                if (checkInterrupt()) break;
                this.self_prompter.handleUserPromptedCmd(self_prompt, isAction(command_name));
                let execute_res = await executeCommand(this, res);
                used_command = true;

                if (execute_res)
                    this.history.add('system', execute_res);
                else
                    break;

                if (settings.show_command_syntax === "full") {
                    this.routeResponse(source, res);
                } else if (settings.show_command_syntax === "shortened") {
                    let pre_message = res.substring(0, res.indexOf(command_name)).trim();
                    let chat_message = `*used ${command_name.substring(1)}*`;
                    if (pre_message.length > 0)
                        chat_message = `${pre_message}  ${chat_message}`;
                    this.routeResponse(source, chat_message);
                } else {
                    let pre_message = res.substring(0, res.indexOf(command_name)).trim();
                    if (pre_message.trim().length > 0)
                        this.routeResponse(source, pre_message);
                }
            } else {
                this.history.add(this.name, res);
                this.routeResponse(source, res);
                break;
            }

            this.history.save();
        }

        return used_command;
    }

    async routeResponse(to_player, message) {
        if (this.shut_up) return;
        let self_prompt = to_player === 'system' || to_player === this.name;
        if (self_prompt && this.last_sender) {
            // this is for when the agent is prompted by system while still in conversation
            // so it can respond to events like death but be routed back to the last sender
            to_player = this.last_sender;
        }

        if (convoManager.isOtherAgent(to_player) && convoManager.inConversation(to_player)) {
            // if we're in an ongoing conversation with the other bot, send the response to it
            convoManager.sendToBot(to_player, message);
        }
        else {
            // otherwise, use open chat
            this.openChat(message);
            // note that to_player could be another bot, but if we get here the conversation has ended
        }
    }

    async openChat(message) {
        let to_translate = message;
        let remaining = '';
        let command_name = containsCommand(message);
        let translate_up_to = command_name ? message.indexOf(command_name) : -1;
        if (translate_up_to != -1) { // don't translate the command
            to_translate = to_translate.substring(0, translate_up_to);
            remaining = message.substring(translate_up_to);
        }
        message = (await handleTranslation(to_translate)).trim() + " " + remaining;
        // newlines are interpreted as separate chats, which triggers spam filters. replace them with spaces
        message = message.replaceAll('\n', ' ');

        if (settings.only_chat_with.length > 0) {
            for (let username of settings.only_chat_with) {
                this.bot.whisper(username, message);
            }
        }
        else {
            if (settings.speak) {
                speak(to_translate, this.prompter.profile.speak_model);
            }
            if (settings.chat_ingame) {
                // [TRACE] Log final speech output
                console.log('[TRACE:BOT_CHAT]', JSON.stringify({
                    message: message,
                    message_length: message.length,
                }));
                this.bot.chat(message);
            }
            sendOutputToServer(this.name, message);
        }
    }

    startEvents() {
        // Custom events
        this.bot.on('time', () => {
            if (this.bot.time.timeOfDay == 0) {
                this.bot.emit('sunrise');
                this.observer?.onEvent('sunrise');
            }
            else if (this.bot.time.timeOfDay == 6000)
                this.bot.emit('noon');
            else if (this.bot.time.timeOfDay == 12000) {
                this.bot.emit('sunset');
                this.observer?.onEvent('sunset');
            }
            else if (this.bot.time.timeOfDay == 18000)
                this.bot.emit('midnight');
        });

        let prev_health = this.bot.health;
        this.bot.lastDamageTime = 0;
        this.bot.lastDamageTaken = 0;
        this.bot.on('health', () => {
            if (this.bot.health < prev_health) {
                this.bot.lastDamageTime = Date.now();
                this.bot.lastDamageTaken = prev_health - this.bot.health;
            }
            prev_health = this.bot.health;
        });
        // Logging callbacks
        this.bot.on('error' , (err) => {
            console.error('Error event!', err);
        });
        // Use connection handler for runtime disconnects
        this.bot.on('end', (reason) => {
            if (!this._disconnectHandled) {
                const { msg } = handleDisconnection(this.name, reason);
                this.cleanKill(msg);
            }
        });
        this.bot.on('death', () => {
            this.actions.cancelResume();
            this.actions.stop();
        });
        this.bot.on('kicked', (reason) => {
            if (!this._disconnectHandled) {
                const { msg } = handleDisconnection(this.name, reason);
                this.cleanKill(msg);
            }
        });
        this.bot.on('messagestr', async (message, _, jsonMsg) => {
            if (jsonMsg.translate && jsonMsg.translate.startsWith('death') && message.startsWith(this.name)) {
                console.log('Agent died: ', message);
                let death_pos = this.bot.entity.position;
                this.memory_bank.rememberPlace('last_death_position', death_pos.x, death_pos.y, death_pos.z);
                let death_pos_text = null;
                if (death_pos) {
                    death_pos_text = `x: ${death_pos.x.toFixed(2)}, y: ${death_pos.y.toFixed(2)}, z: ${death_pos.z.toFixed(2)}`;
                }
                let dimention = this.bot.game.dimension;
                this.llmGate.run(
                    () => this.handleMessage('system', `You died at position ${death_pos_text || "unknown"} in the ${dimention} dimension with the final message: '${message}'. Your place of death is saved as 'last_death_position' if you want to return. Previous actions were stopped and you have respawned.`)
                ).catch(() => {});
                // Persona drift — death events shape caution trait
                this.persona?.drift({ type: 'player_death', attention_score: 1.0 });
            }
        });
        this.bot.on('idle', () => {
            this.bot.clearControlStates();
            this.bot.pathfinder.stop(); // clear any lingering pathfinder
            this.bot.modes.unPauseAll();
            setTimeout(() => {
                if (this.isIdle()) {
                    this.actions.resumeAction();
                }
            }, 1000);
        });

        // Init NPC controller
        this.npc.init();

        // This update loop ensures that each update() is called one at a time, even if it takes longer than the interval
        const INTERVAL = 300;
        let last = Date.now();
        setTimeout(async () => {
            while (true) {
                let start = Date.now();
                await this.update(start - last);
                let remaining = INTERVAL - (Date.now() - start);
                if (remaining > 0) {
                    await new Promise((resolve) => setTimeout(resolve, remaining));
                }
                last = start;
            }
        }, INTERVAL);

        this.bot.emit('idle');
    }

    async update(delta) {
        await this.bot.modes.update();
        // Vision perception tick — throttled internally to ~1s, produces labels for UI
        await this.vision_perception?.update(delta);
        // Observation tick — detects events, manages queue, triggers expression when appropriate
        await this.observer?.update(delta);
        this.self_prompter.update(delta);
        await this.checkTaskDone();
    }

    isIdle() {
        return !this.actions.executing;
    }
    

    cleanKill(msg='Killing agent process...', code=1) {
        this.history.add('system', msg);
        this.bot.chat(code > 1 ? 'Restarting.': 'Exiting.');
        this.history.save();
        process.exit(code);
    }
    async checkTaskDone() {
        if (this.task.data) {
            let res = this.task.isDone();
            if (res) {
                await this.history.add('system', `Task ended with score : ${res.score}`);
                await this.history.save();
                // await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 second for save to complete
                console.log('Task finished:', res.message);
                this.killAll();
            }
        }
    }

    killAll() {
        serverProxy.shutdown();
    }
}
