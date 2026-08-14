import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { NPCData } from './npc/data.js';
import settings from './settings.js';
import { savePersona, saveWorldMemory } from './persona_store.js';


export class History {
    constructor(agent) {
        this.agent = agent;
        this.name = agent.name;
        this.memory_fp = `./bots/${this.name}/memory.json`;
        this.full_history_fp = undefined;

        mkdirSync(`./bots/${this.name}/histories`, { recursive: true });

        this.turns = [];

        // Natural language memory as a summary of recent messages + previous memory
        this.memory = '';

        // Maximum number of messages to keep in context before saving chunk to memory
        this.max_messages = settings.max_messages;

        // Number of messages to remove from current history and save into memory
        this.summary_chunk_size = 5; 
        // chunking reduces expensive calls to promptMemSaving and appendFullHistory
        // and improves the quality of the memory summary
    }

    getHistory() { // expects an Examples object
        return JSON.parse(JSON.stringify(this.turns));
    }

    async summarizeMemories(turns) {
        console.log("Storing memories...");
        this.memory = await this.agent.prompter.promptMemSaving(turns);

        if (this.memory.length > 500) {
            this.memory = this.memory.slice(0, 500);
            this.memory += '...(Memory truncated to 500 chars. Compress it more next time)';
        }

        console.log("Memory updated to: ", this.memory);

        // ═══ Persona Memory Write — driven by plan.memory_write (not policy) ═══
        // Routes to globalMemory (cross-world core experiences) or
        // worldMemory (world-specific events) based on plan type.
        const activePlan = this.agent.persona?.activeBehavior?.plan;
        if (this.agent.persona && activePlan?.memory_write) {
            const dateTag = new Date().toISOString().slice(0, 10);
            const turnSnippets = turns
                .map(t => String(t.content || '').slice(0, 150))
                .filter(Boolean)
                .join(' | ');
            const entry = `\n[${dateTag}] ${activePlan.primary_action}: ${turnSnippets}`;

            // ── Route: core experiences → globalMemory; world events → worldMemory ──
            const worldId = this.agent.currentWorldId || 'default';
            const isCoreExperience = ['mourn', 'engage', 'avoid'].includes(
                this.agent.persona.activeBehavior?.intent?.type
            );

            if (isCoreExperience) {
                // Core persona-shaping events → global (cross-world)
                this.agent.persona.globalMemory += entry;
                if (this.agent.persona.globalMemory.length > 2000) {
                    this.agent.persona.globalMemory =
                        '...(older)\n' + this.agent.persona.globalMemory.slice(-1500);
                }
            } else {
                // World-specific events → per-world
                const existing = this.agent.persona.getWorldMemory(worldId);
                this.agent.persona.setWorldMemory(worldId, existing + entry);
                const current = this.agent.persona.getWorldMemory(worldId);
                if (current.length > 2000) {
                    this.agent.persona.setWorldMemory(worldId,
                        '...(older)\n' + current.slice(-1500));
                }
                saveWorldMemory(this.agent.persona.id, worldId,
                    this.agent.persona.getWorldMemory(worldId));
            }

            savePersona(this.agent.persona);
        }
    }

    async appendFullHistory(to_store) {
        if (this.full_history_fp === undefined) {
            const string_timestamp = new Date().toLocaleString().replace(/[/:]/g, '-').replace(/ /g, '').replace(/,/g, '_');
            this.full_history_fp = `./bots/${this.name}/histories/${string_timestamp}.json`;
            writeFileSync(this.full_history_fp, '[]', 'utf8');
        }
        try {
            const data = readFileSync(this.full_history_fp, 'utf8');
            let full_history = JSON.parse(data);
            full_history.push(...to_store);
            writeFileSync(this.full_history_fp, JSON.stringify(full_history, null, 4), 'utf8');
        } catch (err) {
            console.error(`Error reading ${this.name}'s full history file: ${err.message}`);
        }
    }

    async add(name, content) {
        let role = 'assistant';
        if (name === 'system') {
            role = 'system';
        }
        else if (name !== this.name) {
            role = 'user';
            content = `${name}: ${content}`;
        }
        this.turns.push({role, content});

        if (this.turns.length >= this.max_messages) {
            let chunk = this.turns.splice(0, this.summary_chunk_size);
            while (this.turns.length > 0 && this.turns[0].role === 'assistant')
                chunk.push(this.turns.shift()); // remove until turns starts with system/user message

            await this.summarizeMemories(chunk);
            await this.appendFullHistory(chunk);
        }
    }

    async save() {
        try {
            const data = {
                memory: this.memory,
                turns: this.turns,
                self_prompting_state: this.agent.self_prompter.state,
                self_prompt: this.agent.self_prompter.isStopped() ? null : this.agent.self_prompter.prompt,
                taskStart: this.agent.task.taskStartTime,
                last_sender: this.agent.last_sender,
                // V2.1: observation system persistence
                novelty_familiarity: this.agent.observer?.getNoveltyState?.() || null,
                observation_archive: this.agent.observer?.getArchive?.() || null,
            };
            writeFileSync(this.memory_fp, JSON.stringify(data, null, 2));
            console.log('Saved memory to:', this.memory_fp);
        } catch (error) {
            console.error('Failed to save history:', error);
            throw error;
        }
    }

    load() {
        try {
            if (!existsSync(this.memory_fp)) {
                console.log('No memory file found.');
                return null;
            }
            const data = JSON.parse(readFileSync(this.memory_fp, 'utf8'));
            this.memory = data.memory || '';
            this.turns = data.turns || [];
            // V2.1: expose saved novelty state for Observer hydration
            if (data.novelty_familiarity) {
                this.savedNoveltyState = data.novelty_familiarity;
            }
            console.log('Loaded memory:', this.memory);
            return data;
        } catch (error) {
            console.error('Failed to load history:', error);
            throw error;
        }
    }

    clear() {
        this.turns = [];
        this.memory = '';
    }
}