/**
 * NovelPage — AI Novel Translator (DeepSeek-powered).
 *
 * Loads translation history from backend on mount.
 */
import { useEffect, useCallback, useState } from "react";
import ApiKeyInput from "../../components/ApiKeyInput";
import NovelInput from "../../components/NovelInput";
import VocabInput from "../../components/VocabInput";
import OutputDisplay from "../../components/OutputDisplay";
import VocabStar from "../../components/vocab/VocabStar";
import useConfigStore from "../../store/configStore";
import useAiReady from "../../hooks/useAiReady";
import useNovelStore from "./store";
import { postTranslate, getNovelSessions, getNovelSession } from "./api";

export default function NovelPage() {
  // ── Global config ──────────────────────────────────────────
  const deepseekApiKey = useConfigStore((s) => s.deepseekApiKey);
  const setConfig = useConfigStore((s) => s.setConfig);
  const { hosted, deepseekReady } = useAiReady();

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

  // ── History ──────────────────────────────────────────────────
  const [historySessions, setHistorySessions] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load translation history from backend on mount
  useEffect(() => {
    getNovelSessions()
      .then((data) => {
        if (data.sessions && data.sessions.length > 0) {
          setHistorySessions(data.sessions);
          setShowHistory(true);  // Auto-show history when sessions exist
        }
      })
      .catch(() => {});
  }, [result]); // refresh when a new translation completes

  const loadHistorySession = (sessionId) => {
    getNovelSession(sessionId).then((s) => {
      if (s.messages) {
        // Restore to view
        const userMsg = s.messages.find((m) => m.role === "user");
        const assistantMsg = s.messages.find((m) => m.role === "assistant");
        if (userMsg) setNovelText(userMsg.content || "");
        if (assistantMsg) {
          setResult({ translated_text: assistantMsg.content, highlights: assistantMsg.highlights || [] });
        }
      }
    }).catch(() => {});
  };

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
    if (novelReady && vocabReady && deepseekReady && novelText) {
      doTranslate();
    }
  }, [novelReady, vocabReady]);

  return (
    <div className="page-content">
      <header>
        <h1>AI 小说翻译器</h1>
        <p>四六级备考 × 兴趣阅读</p>
      </header>

      {/* ── Translation History ────────────────────────────── */}
      {historySessions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <button className="nes-btn" style={{ fontSize: "0.75rem" }}
            onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? "隐藏" : "显示"}翻译历史（{historySessions.length}）
          </button>
          {showHistory && (
            <div className="window" style={{ marginTop: 8, padding: "10px 14px" }}>
              {historySessions.map((s) => (
                <button key={s.session_id}
                  className="nes-btn"
                  style={{ fontSize: "0.7rem", margin: "3px 4px", display: "inline-block" }}
                  onClick={() => loadHistorySession(s.session_id)}>
                  {s.preview?.slice(0, 40) || s.session_id?.slice(0, 8)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <main className="novel-main">
        <div className="window window-col">
          <h3 className="window-title">第 1 步 — 上传小说</h3>
          {!hosted && (
            <ApiKeyInput
              apiKey={deepseekApiKey}
              setApiKey={(val) => setConfig({ deepseekApiKey: val })}
            />
          )}
          <NovelInput
            novelText={novelText}
            setNovelText={setNovelText}
            ready={novelReady}
            setReady={setNovelReady}
          />
        </div>
        <div className="window window-col">
          <VocabInput
            vocabText={vocabText}
            setVocabText={setVocabText}
            ready={vocabReady}
            setReady={setVocabReady}
          />
        </div>
        <div className="window window-col">
          <OutputDisplay result={result} loading={loading} error={error} />
          {result && result.highlights && result.highlights.length > 0 && (
            <div style={{ marginTop: 10, borderTop: "1px solid var(--border-default)", paddingTop: 10 }}>
              <p style={{ fontSize: "0.7rem", color: "var(--accent)", fontFamily: "var(--font-mono)", marginBottom: 8 }}>
                将高亮单词收藏到词汇库
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {result.highlights.map((h, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 4,
                    background: "var(--bg-input)", border: "1px solid var(--border-default)", padding: "4px 8px", borderRadius: 4 }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--highlight)" }}>{h.word}</span>
                    <VocabStar
                      word={h.word}
                      context={result.translated_text?.slice(Math.max(0, h.start - 20), h.end + 50) || ""}
                      sourceModule="novel"
                      apiKey={deepseekApiKey}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
