/**
 * English Diary page — write daily entries, get AI corrections and scoring.
 *
 * Two-panel layout:
 *   Left: date + subject prompt + textarea + Submit
 *   Right: corrections diff view + score card + ⭐ highlighted expressions
 */
import { useState, useEffect, useCallback } from "react";
import useConfigStore from "../../store/configStore";
import VocabStar from "../../components/vocab/VocabStar";
import { submitDiary, getDiaryEntries, getDiaryStreak } from "./api";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function DiaryPage() {
  const deepseekApiKey = useConfigStore((s) => s.deepseekApiKey);

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
        <h1>✍️ English Diary</h1>
        <p>Write daily · AI corrections · build your writing habit</p>
      </header>

      <main style={{ display: "flex", gap: 16, flex: 1, flexWrap: "wrap" }}
        className="novel-main">
        {/* ── Left Panel — Writing ────────────────────────── */}
        <div className="window window-col" style={{ minWidth: 280 }}>
          <h3 className="window-title">{todayStr()}</h3>

          <div style={{ fontSize: "0.5rem", color: "#7a6a9a", marginBottom: 10 }}>
            <span style={{ color: "#50fa7b" }}>Prompt: </span>
            {prompt}
          </div>

          <textarea
            className="nes-textarea debater-text-input"
            style={{ flex: 1, minHeight: 180, fontFamily: "'Microsoft YaHei', monospace", fontSize: "0.6rem" }}
            placeholder="Start writing your diary in English..."
            value={text}
            onChange={(e) => { setText(e.target.value); setSubmitted(false); }}
          />

          <button
            className="nes-btn is-primary block-btn"
            style={{ marginTop: 12 }}
            onClick={handleSubmit}
            disabled={loading || !text.trim() || !deepseekApiKey}
          >
            {loading ? "⌛ Analyzing..." : "✅ Submit for Review"}
          </button>

          {!deepseekApiKey && (
            <p style={{ fontSize: "0.45rem", color: "#ff6b8a", marginTop: 6 }}>
              DeepSeek API Key required. Configure in Settings ⚙
            </p>
          )}
        </div>

        {/* ── Right Panel — Results ───────────────────────── */}
        <div className="window window-col" style={{ minWidth: 280 }}>
          <h3 className="window-title">Corrections & Score</h3>

          {error && (
            <div className="debater-error nes-container is-rounded">
              <p>⚠ {error}</p>
            </div>
          )}

          {loading && (
            <div className="debater-loading">
              <progress className="nes-progress is-primary" max="100" style={{ width: "100%" }}></progress>
              <p>Grading your diary...</p>
            </div>
          )}

          {result && !loading && (
            <div style={{ overflowY: "auto", flex: 1 }}>
              {/* Score card */}
              <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                {[
                  { k: "grammar", label: "Grammar", color: "#50fa7b" },
                  { k: "vocabulary", label: "Vocab", color: "#87ceeb" },
                  { k: "fluency", label: "Fluency", color: "#ffd700" },
                ].map(({ k, label, color }) => (
                  <div key={k} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: "0.4rem", color: "#7a6a9a", fontFamily: "'Press Start 2P', monospace" }}>
                      {label}
                    </div>
                    <div style={{ fontSize: "1.2rem", fontFamily: "'Press Start 2P', monospace", color, textShadow: `2px 2px 0 #0d400d` }}>
                      {result.score?.[k] ?? "-"}
                    </div>
                  </div>
                ))}
              </div>

              {/* Corrections */}
              {(result.corrections || []).map((c, ci) => (
                <div key={ci} style={{ marginBottom: 10, fontSize: "0.5rem" }}>
                  <p style={{ color: "#6a5a8a", textDecoration: "line-through", margin: "0 0 3px" }}>
                    {c.sentence || c.original}
                  </p>
                  {(c.issues || []).map((iss, ii) => (
                    <div key={ii} style={{ fontSize: "0.45rem", marginBottom: 4, paddingLeft: 10 }}>
                      <span style={{ color: "#ff6b8a" }}>{iss.original}</span>
                      <span style={{ color: "#9b8ab8" }}> → </span>
                      <span style={{ color: "#50fa7b" }}>{iss.suggestion}</span>
                      <br />
                      <span style={{ color: "#6a5a8a" }}>{iss.reason}</span>
                    </div>
                  ))}
                </div>
              ))}

              {/* Highlighted expressions with VocabStar */}
              {(result.highlighted_expressions || []).length > 0 && (
                <div style={{ marginTop: 14, borderTop: "2px solid #3d1a60", paddingTop: 10 }}>
                  <p style={{ fontSize: "0.45rem", color: "#50fa7b", fontFamily: "'Press Start 2P', monospace", marginBottom: 6 }}>
                    ⭐ Highlighted Expressions
                  </p>
                  {result.highlighted_expressions.map((expr, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: "0.55rem", color: "#87ceeb" }}>{expr}</span>
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
                <p style={{ fontSize: "0.5rem", color: "#6a5a8a", textAlign: "center" }}>
                  Your submission has been reviewed. No major issues found!
                </p>
              )}
            </div>
          )}

          {!result && !loading && !error && (
            <div className="placeholder-box">
              <p>
                Your AI-corrected diary will appear here <br />
                after you submit your entry.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
