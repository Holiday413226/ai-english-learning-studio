/**
 * Zustand store for the Debater subsystem.
 *
 * Manages sessions, messages, mode, and voice state.
 * API keys and Bot IDs are in the global configStore (not here).
 *
 * Persisted to localStorage — sessions survive page navigation and refresh.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_SESSIONS = 30;
const MAX_MESSAGES = 100;

export const VoiceState = {
  IDLE: "idle",
  RECORDING: "recording",
  TRANSCRIBING: "transcribing",
  THINKING: "thinking",
  SPEAKING: "speaking",
  ERROR: "error",
};

const useDebaterStore = create(
  persist(
    (set, get) => ({
      // ── Sessions ──────────────────────────────────────────
      sessions: {},
      currentSessionId: null,

      setCurrentSessionId: (id) => set({ currentSessionId: id }),

      createSession: () => {
        const id = crypto.randomUUID();
        const now = Date.now();
        set((state) => {
          const sessions = { ...state.sessions };
          sessions[id] = {
            mode: "debate",
            messages: [],
            createdAt: now,
            updatedAt: now,
          };
          const ids = Object.keys(sessions);
          if (ids.length > MAX_SESSIONS) {
            const oldest = ids.sort(
              (a, b) => sessions[a].createdAt - sessions[b].createdAt
            )[0];
            delete sessions[oldest];
          }
          return { sessions, currentSessionId: id };
        });
        return id;
      },

      deleteSession: (id) =>
        set((state) => {
          const sessions = { ...state.sessions };
          delete sessions[id];
          return {
            sessions,
            currentSessionId:
              state.currentSessionId === id ? null : state.currentSessionId,
          };
        }),

      // ── Messages ──────────────────────────────────────────
      addMessage: (sessionId, role, content, audioUrl = null) =>
        set((state) => {
          if (!sessionId) return state;
          const sessions = { ...state.sessions };
          let session = sessions[sessionId];
          if (!session) {
            const now = Date.now();
            session = {
              mode: state.mode || "debate",
              messages: [],
              createdAt: now,
              updatedAt: now,
            };
          }
          const messages = [
            ...session.messages,
            { role, content, audioUrl, timestamp: Date.now() },
          ].slice(-MAX_MESSAGES);
          sessions[sessionId] = { ...session, messages, updatedAt: Date.now() };
          const currentSessionId = state.currentSessionId || sessionId;
          return { sessions, currentSessionId };
        }),

      // ── Mode ──────────────────────────────────────────────
      mode: "debate",
      setMode: (mode) => set({ mode }),

      // ── Voice State ───────────────────────────────────────
      voiceState: VoiceState.IDLE,
      setVoiceState: (voiceState) => set({ voiceState }),

      // ── Derived helpers ───────────────────────────────────
      getCurrentSession: () => {
        const { sessions, currentSessionId } = get();
        return currentSessionId ? sessions[currentSessionId] : null;
      },
    }),
    {
      name: "debater-store",
      version: 2,
      partialize: (state) => ({
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
        mode: state.mode,
        voiceState: state.voiceState,
      }),
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
            // silently ignore
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

export default useDebaterStore;
