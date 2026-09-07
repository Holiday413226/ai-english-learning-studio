/**
 * English Diary page — write daily entries, get AI corrections and scoring.
 *
 * Two-panel layout:
 *   Left: date + subject prompt + textarea + Submit
 *   Right: corrections diff view + score card + ⭐ highlighted expressions
 */
import { useState, useEffect, useCallback } from "react";
import useConfigStore from "../../store/configStore";
import useAiReady from "../../hooks/useAiReady";
import VocabStar from "../../components/vocab/VocabStar";
import { submitDiary, getDiaryEntries, getDiaryStreak } from "./api";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function DiaryPage() {
  const deepseekApiKey = useConfigStore((s) => s.deepseekApiKey);
  const { deepseekReady } = useAiReady();

  const [text, setText] = useState("");
  const [result, setResult] = useState(null);   // {corrections, score, highlighted_expressions}
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  // Simple subject prompts — could be enriched by AI later
  const subjects = [
    "Describe a memorable moment from this week.",
    "What are you grateful for today?",
    "Write about a person who inspires you.",
    "What did you learn today?",
    "Describe your dream job and why.",
  ];
  const [prompt] = useState(() => subjects[Math.floor(Math.random() * subjects.length)]);

  const handleSubmit = useCallback(async () => {
    if (!text.trim()) return;
    setError(null);
    setLoading(true);
    setSubmitted(true);
    try {
      const data = await submitDiary(deepseekApiKey, text, todayStr());
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [text, deepseekApiKey]);

  return (
    <div className="page-content">
      <header>
        <h1>英语日记</h1>
        <p>每日写作 · AI 批改 · 养成写作习惯</p>
      </header>

      <main style={{ display: "flex", gap: 16, flex: 1, flexWrap: "wrap" }}
        className="novel-main">
        {/* ── Left Panel — Writing ────────────────────────── */}
        <div className="window window-col" style={{ minWidth: 280 }}>
          <h3 className="window-title">{todayStr()}</h3>

          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 10 }}>
            <span style={{ color: "var(--accent)" }}>题目：</span>
            {prompt}
          </div>

          <textarea
            className="nes-textarea debater-text-input"
            style={{ flex: 1, minHeight: 180, fontFamily: "var(--font-sans)", fontSize: "0.85rem" }}
            placeholder="开始用英语写日记…"
            value={text}
            onChange={(e) => { setText(e.target.value); setSubmitted(false); }}
          />

          <button
            className="nes-btn is-primary block-btn"
            style={{ marginTop: 12 }}
            onClick={handleSubmit}
            disabled={loading || !text.trim() || !deepseekReady}
          >
            {loading ? "分析中…" : "提交批改"}
          </button>

          {!deepseekReady && (
            <p style={{ fontSize: "0.65rem", color: "var(--danger)", marginTop: 6 }}>
              需要 DeepSeek API 密钥，请在设置中配置。
            </p>
          )}
        </div>

        {/* ── Right Panel — Results ───────────────────────── */}
        <div className="window window-col" style={{ minWidth: 280 }}>
          <h3 className="window-title">批改与评分</h3>

          {error && (
            <div className="debater-error">
              <p>{error}</p>
            </div>
          )}

          {loading && (
            <div className="debater-loading">
              <progress className="nes-progress is-primary" max="100" style={{ width: "100%" }}></progress>
              <p>正在批改你的日记…</p>
            </div>
          )}

          {result && !loading && (
            <div style={{ overflowY: "auto", flex: 1 }}>
              {/* Score card */}
              <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                {[
                  { k: "grammar", label: "语法", color: "var(--accent)" },
                  { k: "vocabulary", label: "词汇", color: "var(--highlight)" },
                  { k: "fluency", label: "流畅度", color: "#ffd700" },
                ].map(({ k, label, color }) => (
                  <div key={k} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                      {label}
                    </div>
                    <div style={{ fontSize: "1.2rem", fontFamily: "var(--font-mono)", color, textShadow: "0 0 8px rgba(80, 250, 123, 0.15)" }}>
                      {result.score?.[k] ?? "-"}
                    </div>
                  </div>
                ))}
              </div>

              {/* Corrections */}
              {(result.corrections || []).map((c, ci) => (
                <div key={ci} style={{ marginBottom: 10, fontSize: "0.75rem" }}>
                  <p style={{ color: "var(--text-muted)", textDecoration: "line-through", margin: "0 0 3px" }}>
                    {c.sentence || c.original}
                  </p>
                  {(c.issues || []).map((iss, ii) => (
                    <div key={ii} style={{ fontSize: "0.7rem", marginBottom: 4, paddingLeft: 10 }}>
                      <span style={{ color: "var(--danger)" }}>{iss.original}</span>
                      <span style={{ color: "var(--text-secondary)" }}> → </span>
                      <span style={{ color: "var(--accent)" }}>{iss.suggestion}</span>
                      <br />
                      <span style={{ color: "var(--text-muted)" }}>{iss.reason}</span>
                    </div>
                  ))}
                </div>
              ))}

              {/* Highlighted expressions with VocabStar */}
              {(result.highlighted_expressions || []).length > 0 && (
                <div style={{ marginTop: 14, borderTop: "1px solid var(--border-default)", paddingTop: 10 }}>
                  <p style={{ fontSize: "0.65rem", color: "var(--accent)", fontFamily: "var(--font-mono)", marginBottom: 6 }}>
                    亮点表达
                  </p>
                  {result.highlighted_expressions.map((expr, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: "0.8rem", color: "var(--highlight)" }}>{expr}</span>
                      <VocabStar
                        word={expr}
                        context={expr}
                        sourceModule="diary"
                        apiKey={deepseekApiKey}
                      />
                    </div>
                  ))}
                </div>
              )}

              {!result.corrections?.length && !result.highlighted_expressions?.length && submitted && (
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center" }}>
                  你的日记已批改，未发现重大问题！
                </p>
              )}
            </div>
          )}

          {!result && !loading && !error && (
            <div className="placeholder-box">
              <p>
                提交日记后，AI 批改结果将显示在这里。
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
