/**
 * Zustand store for the Minecraft subsystem.
 *
 * Manages sessions, messages.  API keys and Bot IDs are in configStore.
 * Persisted to localStorage.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_SESSIONS = 30;
const MAX_MESSAGES = 100;

const useMinecraftStore = create(
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

      getCurrentSession: () => {
        const { sessions, currentSessionId } = get();
        return currentSessionId ? sessions[currentSessionId] : null;
      },
    }),
    {
      name: "minecraft-store",
      version: 1,
      partialize: (state) => ({
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
      }),
      storage: {
        getItem: (name) => {
          try { return localStorage.getItem(name); } catch { return null; }
        },
        setItem: (name, value) => {
          try { localStorage.setItem(name, value); } catch { /* ignore */ }
        },
        removeItem: (name) => {
          try { localStorage.removeItem(name); } catch { /* ignore */ }
        },
      },
    }
  )
);

export default useMinecraftStore;
