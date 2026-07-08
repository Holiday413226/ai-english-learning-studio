/**
 * Zustand store for the Novel (AI Novel Translator) subsystem.
 *
 * Persisted to localStorage — text and results survive page navigation
 * and browser refresh.  API keys are in configStore (not here).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

const useNovelStore = create(
  persist(
    (set) => ({
      // ── Form fields ─────────────────────────────────────────
      novelText: "",
      vocabText: "",

      // ── UI state ────────────────────────────────────────────
      novelReady: false,
      vocabReady: false,
      result: null,
      loading: false,
      error: null,

      // ── Actions ─────────────────────────────────────────────
      setNovelText: (novelText) => set({ novelText }),
      setVocabText: (vocabText) => set({ vocabText }),
      setNovelReady: (ready) => set({ novelReady: ready }),
      setVocabReady: (ready) => set({ vocabReady: ready }),
      setResult: (result) => set({ result, loading: false }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error, loading: false }),
      clearResult: () => set({ result: null, error: null }),
    }),
    {
      name: "novel-store",
      version: 1,
      partialize: (state) => ({
        novelText: state.novelText,
        vocabText: state.vocabText,
        result: state.result,
      }),
    }
  )
);

export default useNovelStore;
