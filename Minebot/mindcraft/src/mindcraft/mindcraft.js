import { createMindServer, registerAgent, numStateListeners } from './mindserver.js';
import { AgentProcess } from '../process/agent_process.js';
import { getServer } from './mcserver.js';
import { readdirSync, existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import open from 'open';

let mindserver;
let connected = false;
let agent_processes = {};
let agent_count = 0;
let mindserver_port = 8080;

/**
 * Merge skin_url/skin_model settings into profile.skin (single source of truth).
 * Agent code only reads profile.skin — never reads settings.skin_url directly.
 */
export function applySkinToProfile(settings) {
    settings.profile = settings.profile || {};

    // Safely clear old skin (check property exists before delete)
    if ('skin' in settings.profile) {
        delete settings.profile.skin;
    }

    const url = String(settings.skin_url || '').trim();
    const model = (settings.skin_model || 'slim').toLowerCase();

    // Only accept HTTP(S) URLs — rejects empty strings, "abc", undefined, etc.
    if (url.length > 0 && /^https?:\/\//i.test(url)) {
        settings.profile.skin = {
            provider: 'url',
            model: model,
            url: url,
        };
    }
    // url is empty or not HTTP(S) → profile.skin was deleted → agent.js sends /skin clear
}

export async function init(host_public=false, port=8080, auto_open_ui=true) {
    if (connected) {
        console.error('Already initiliazed!');
        return;
    }
    mindserver = createMindServer(host_public, port);
    mindserver_port = port;

    // Restore persistent agents from disk
    try {
        const botsDir = './bots';
        if (existsSync(botsDir)) {
            const entries = readdirSync(botsDir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                const agentJsonPath = `./bots/${entry.name}/agent.json`;
                const lastProfilePath = `./bots/${entry.name}/last_profile.json`;
                if (!existsSync(agentJsonPath)) continue;

                try {
                    const meta = JSON.parse(readFileSync(agentJsonPath, 'utf8'));
                    if (meta.type !== 'persistent') continue;

                    // Read the saved profile snapshot
                    if (!existsSync(lastProfilePath)) {
                        console.warn(`[RESTORE] Agent '${entry.name}' has agent.json but no last_profile.json, skipping`);
                        continue;
                    }
                    const profile = JSON.parse(readFileSync(lastProfilePath, 'utf8'));

                    // Merge non-profile settings with profile
                    const fullSettings = { ...meta.settings, profile };
                    applySkinToProfile(fullSettings); // merge skin_url/skin_model into profile.skin
                    fullSettings.agent_type = 'persistent'; // preserve type

                    const viewerPort = meta.viewer_port || (3000 + agent_count);
                    registerAgent(fullSettings, viewerPort);
                    agent_count = Math.max(agent_count, viewerPort - 3000 + 1);
                    console.log(`[RESTORE] Restored persistent agent '${entry.name}' (offline)`);
                } catch (err) {
                    console.warn(`[RESTORE] Failed to restore agent '${entry.name}':`, err.message);
                }
            }
        }
    } catch (err) {
        console.warn('[RESTORE] Failed to scan bots directory:', err.message);
    }

    connected = true;
    if (auto_open_ui) {
        setTimeout(() => {
            // check if browser listener is already open
            if (numStateListeners() === 0) {
                open('http://localhost:'+port);
            }
        }, 3000);
    }
}

export async function createAgent(settings) {
    if (!settings.profile.name) {
        console.error('Agent name is required in profile');
        return {
            success: false,
            error: 'Agent name is required in profile'
        };
    }
    settings = JSON.parse(JSON.stringify(settings));
    applySkinToProfile(settings); // merge skin_url/skin_model into profile.skin
    let agent_name = settings.profile.name;
    const agentIndex = agent_count++;
    const viewer_port = 3000 + agentIndex;
    registerAgent(settings, viewer_port);

    // Persist agent configuration for persistent agents
    if (settings.agent_type === 'persistent') {
        try {
            const agentDir = `./bots/${agent_name}`;
            mkdirSync(agentDir, { recursive: true });

            // Extract non-profile settings (everything except the profile object)
            const { profile, ...nonProfileSettings } = settings;

            const agentMeta = {
                name: agent_name,
                type: 'persistent',
                created_at: new Date().toISOString(),
                viewer_port,
                settings: nonProfileSettings,
            };

            writeFileSync(`${agentDir}/agent.json`, JSON.stringify(agentMeta, null, 2), 'utf8');
            console.log(`[PERSIST] Saved agent configuration for '${agent_name}'`);
        } catch (err) {
            console.error(`[PERSIST] Failed to save agent.json for '${agent_name}':`, err.message);
            // Don't fail the creation — agent can still run, just won't persist
        }
    }

    let load_memory = settings.load_memory || false;
    let init_message = settings.init_message || null;

    try {
        try {
            const server = await getServer(settings.host, settings.port, settings.minecraft_version);
            settings.host = server.host;
            settings.port = server.port;
            settings.minecraft_version = server.version;
        } catch (error) {
            console.warn(`Error getting server:`, error);
            if (settings.minecraft_version === "auto") {
                settings.minecraft_version = null;
            }
            console.warn(`Attempting to connect anyway...`);
        }

        const agentProcess = new AgentProcess(agent_name, mindserver_port);
        agentProcess.start(load_memory, init_message, agentIndex);
        agent_processes[settings.profile.name] = agentProcess;
    } catch (error) {
        console.error(`Error creating agent ${agent_name}:`, error);
        destroyAgent(agent_name);
        return {
            success: false,
            error: error.message
        };
    }
    return {
        success: true,
        error: null
    };
}

export function getAgentProcess(agentName) {
    return agent_processes[agentName];
}

export function startAgent(agentName) {
    if (agent_processes[agentName]) {
        agent_processes[agentName].forceRestart();
    }
    else {
        // Recovery path: agent is registered (persistent, restored on startup)
        // but has no running process. Rebuild from saved configuration.
        const agentJsonPath = `./bots/${agentName}/agent.json`;
        const lastProfilePath = `./bots/${agentName}/last_profile.json`;
        if (existsSync(agentJsonPath) && existsSync(lastProfilePath)) {
            try {
                const meta = JSON.parse(readFileSync(agentJsonPath, 'utf8'));
                const profile = JSON.parse(readFileSync(lastProfilePath, 'utf8'));
                const fullSettings = { ...meta.settings, profile };
                fullSettings.agent_type = meta.type || 'persistent';

                const viewerPort = meta.viewer_port || (3000 + agent_count);
                const agentIndex = viewerPort - 3000;
                agent_count = Math.max(agent_count, agentIndex + 1);

                console.log(`[START] Recovering persistent agent '${agentName}' from disk`);
                const agentProcess = new AgentProcess(agentName, mindserver_port);
                agentProcess.start(true, null, agentIndex); // load_memory=true
                agent_processes[agentName] = agentProcess;
            } catch (err) {
                console.error(`[START] Failed to recover agent '${agentName}':`, err.message);
            }
        }
        else {
            console.error(`Cannot start agent ${agentName}; not found`);
        }
    }
}

export function stopAgent(agentName) {
    if (agent_processes[agentName]) {
        agent_processes[agentName].stop();
    }
}

export function destroyAgent(agentName) {
    if (agent_processes[agentName]) {
        agent_processes[agentName].stop();
        delete agent_processes[agentName];
    }
    // Remove persistent agent registration
    const agentJsonPath = `./bots/${agentName}/agent.json`;
    if (existsSync(agentJsonPath)) {
        try {
            unlinkSync(agentJsonPath);
            console.log(`[DESTROY] Removed agent configuration for '${agentName}'`);
        } catch (err) {
            console.warn(`[DESTROY] Failed to remove agent.json for '${agentName}':`, err.message);
        }
    }
}

export function shutdown() {
    console.log('Shutting down');
    for (let agentName in agent_processes) {
        agent_processes[agentName].stop();
    }
    setTimeout(() => {
        process.exit(0);
    }, 2000);
}
