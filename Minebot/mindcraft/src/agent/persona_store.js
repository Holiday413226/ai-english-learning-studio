/**
 * PersonaStore — Persona 持久化层。
 *
 * Persona 数据独立于 world memory，存储在 ./personas/{personaId}/persona.json。
 * 与 ./bots/{name}/memory.json 完全分离。
 *
 * 设计原则：
 *   - Persona 跨世界持久化（persona.json）
 *   - World memory 按 world 隔离（memory.json）
 *   - 两个存储独立，不互相污染
 *   - 本模块只做 JSON 读写，不导入 Persona 类（避免循环依赖）
 *   - 调用方负责 Persona.fromJSON(rawData) 转换
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const PERSONA_DIR = './personas';

/**
 * Load raw persona data from disk.
 * Returns plain JSON object, or null if not found.
 * Caller should use Persona.fromJSON(data) to hydrate.
 *
 * @param {string} personaId
 * @returns {object | null}
 */
export function loadPersonaData(personaId) {
    if (!personaId) return null;
    const fp = `${PERSONA_DIR}/${personaId}/persona.json`;
    if (!existsSync(fp)) return null;

    try {
        return JSON.parse(readFileSync(fp, 'utf8'));
    } catch (err) {
        console.error(`Failed to load persona '${personaId}':`, err.message);
        return null;
    }
}

/**
 * Save persona to disk.
 * Accepts a Persona instance (must have .id and .toJSON()).
 *
 * @param {import('./persona.js').Persona} persona
 */
export function savePersona(persona) {
    if (!persona || !persona.id) return;

    const dir = `${PERSONA_DIR}/${persona.id}`;
    try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(
            `${dir}/persona.json`,
            JSON.stringify(persona.toJSON(), null, 2),
            'utf8'
        );
    } catch (err) {
        console.error(`Failed to save persona '${persona.id}':`, err.message);
    }
}

// ---------------------------------------------------------------------------
// World Memory — per-world isolation
// Stored as personas/{id}/worlds/{worldId}.json
// ---------------------------------------------------------------------------

/**
 * Load world-specific memory.
 * @param {string} personaId
 * @param {string} worldId
 * @returns {string} Memory string, or '' if not found
 */
export function loadWorldMemory(personaId, worldId) {
    if (!personaId || !worldId) return '';
    const fp = `${PERSONA_DIR}/${personaId}/worlds/${worldId}.json`;
    if (!existsSync(fp)) return '';
    try {
        const data = JSON.parse(readFileSync(fp, 'utf8'));
        return data.memory || '';
    } catch (err) {
        console.error(`Failed to load world memory '${personaId}/${worldId}':`, err.message);
        return '';
    }
}

/**
 * Save world-specific memory.
 * @param {string} personaId
 * @param {string} worldId
 * @param {string} memory
 */
export function saveWorldMemory(personaId, worldId, memory) {
    if (!personaId || !worldId) return;
    const dir = `${PERSONA_DIR}/${personaId}/worlds`;
    try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(
            `${dir}/${worldId}.json`,
            JSON.stringify({ worldId, memory, savedAt: Date.now() }, null, 2),
            'utf8'
        );
    } catch (err) {
        console.error(`Failed to save world memory '${personaId}/${worldId}':`, err.message);
    }
}
