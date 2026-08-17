/**
 * Global application configuration store.
 *
 * Stores ALL API keys and Bot IDs for every subsystem in one place.
 * Persisted to localStorage — the backend NEVER stores sensitive keys.
 *
 * Each API call from any subsystem includes the relevant key(s) in the
 * request body — nothing is ever read from a server-side config file.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

const useConfigStore = create(
  persist(
    (set, get) => ({
      // ── COZE (shared by Debater + Minecraft) ──────────────────
      cozeApiKey: "",
      cozeApiUrl: "",

      // ── Bot IDs per subsystem ──────────────────────────────────
      debateBotId: "",
      discussBotId: "",
      minecraftBotId: "",

      // ── TTS voice preference ──────────────────────────────────
      ttsVoiceGender: "female",   // "female" | "male"

      // ── DeepSeek (Novel translation) ───────────────────────────
      deepseekApiKey: "",

      // ── Actions ─────────────────────────────────────────────────
      setConfig: (updates) =>
        set((state) => {
          const next = { ...state };
          for (const [k, v] of Object.entries(updates)) {
            if (k in state) next[k] = v;
          }
          return next;
        }),

      /** True if at least one API key is configured. */
      isConfigured: () => {
        const s = get();
        return !!(s.cozeApiKey || s.deepseekApiKey);
      },

      /** True if Debater/Minecraft COZE setup is complete. */
      isCozeReady: () => {
        const s = get();
        return !!(s.cozeApiKey && (s.debateBotId || s.discussBotId));
      },

      /** True if Novel DeepSeek setup is complete. */
      isDeepseekReady: () => {
        const s = get();
        return !!s.deepseekApiKey;
      },
    }),
    {
      name: "app-config",
      version: 1,
      storage: {
        getItem: (name) => {
          try {
            return localStorage.getItem(name);
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, value);
          } catch {
            // quota exceeded or private browsing — silently ignore
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name);
          } catch {
            // ignore
          }
        },
      },
    }
  )
);

export default useConfigStore;
