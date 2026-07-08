/**
 * NovelPage — AI Novel Translator (DeepSeek-powered).
 *
 * Three-step workflow:
 *   1. Upload novel text + DeepSeek API Key
 *   2. Upload CET-4/6 vocabulary list
 *   3. View translated English output with highlighted vocab words
 *
 * State is persisted via Zustand — survives page navigation.
 * API key is read from global configStore and sent with every request.
 */
import { useEffect, useCallback } from "react";
import ApiKeyInput from "../../components/ApiKeyInput";
import NovelInput from "../../components/NovelInput";
import VocabInput from "../../components/VocabInput";
import OutputDisplay from "../../components/OutputDisplay";
import useConfigStore from "../../store/configStore";
import useNovelStore from "./store";
import { postTranslate } from "./api";

export default function NovelPage() {
  // ── Global config ──────────────────────────────────────────
  const deepseekApiKey = useConfigStore((s) => s.deepseekApiKey);
  const setConfig = useConfigStore((s) => s.setConfig);

  // ── Subsystem state (Zustand + persist) ────────────────────
  const novelText = useNovelStore((s) => s.novelText);
  const vocabText = useNovelStore((s) => s.vocabText);
  const novelReady = useNovelStore((s) => s.novelReady);
  const vocabReady = useNovelStore((s) => s.vocabReady);
  const result = useNovelStore((s) => s.result);
  const loading = useNovelStore((s) => s.loading);
  const error = useNovelStore((s) => s.error);

  const setNovelText = useNovelStore((s) => s.setNovelText);
  const setVocabText = useNovelStore((s) => s.setVocabText);
  const setNovelReady = useNovelStore((s) => s.setNovelReady);
  const setVocabReady = useNovelStore((s) => s.setVocabReady);
  const setResult = useNovelStore((s) => s.setResult);
  const setLoading = useNovelStore((s) => s.setLoading);
  const setError = useNovelStore((s) => s.setError);

  const doTranslate = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await postTranslate(deepseekApiKey, novelText, vocabText);
      setResult(data);
      setNovelReady(false);
      setVocabReady(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [deepseekApiKey, novelText, vocabText]);

  useEffect(() => {
    if (novelReady && vocabReady && deepseekApiKey && novelText) {
      doTranslate();
    }
  }, [novelReady, vocabReady]);

  return (
    <div className="page-content">
      <header>
        <h1>AI Novel Translator</h1>
        <p>CET-4/6 Exam Prep x Interest Reading</p>
      </header>

      <main className="novel-main">
        {/* Window 1 — API Key + Novel Upload */}
        <div className="window window-col">
          <h3 className="window-title">Step 1 — Upload Novel</h3>
          <ApiKeyInput
            apiKey={deepseekApiKey}
            setApiKey={(val) => setConfig({ deepseekApiKey: val })}
          />
          <NovelInput
            novelText={novelText}
            setNovelText={setNovelText}
            ready={novelReady}
            setReady={setNovelReady}
          />
        </div>

        {/* Window 2 — Vocabulary Upload */}
        <div className="window window-col">
          <VocabInput
            vocabText={vocabText}
            setVocabText={setVocabText}
            ready={vocabReady}
            setReady={setVocabReady}
          />
        </div>

        {/* Window 3 — Output */}
        <div className="window window-col">
          <OutputDisplay result={result} loading={loading} error={error} />
        </div>
      </main>
    </div>
  );
}
