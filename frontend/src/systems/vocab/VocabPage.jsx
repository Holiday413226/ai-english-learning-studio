/**
 * Vocab Vault page — three tabs: Word List, Flashcards, Quiz.
 *
 * Uses NES.css styling for the pixel retro look consistent with the app theme.
 */
import { useState, useEffect, useCallback } from "react";
import useConfigStore from "../../store/configStore";
import { listWords, deleteWord, reviewWord, getDueWords, getQuiz, exportCSV } from "./api";

const TABS = ["📋 Word List", "🔄 Flashcards", "🎯 Quiz"];

const QUALITY_LABELS = [
  { q: 0, label: "😰 Forgot", cls: "is-error" },
  { q: 3, label: "🤔 Unsure", cls: "is-warning" },
  { q: 5, label: "😊 Got It", cls: "is-success" },
];

export default function VocabPage() {
  const deepseekApiKey = useConfigStore((s) => s.deepseekApiKey);

  const [tab, setTab] = useState(0);
  const [words, setWords] = useState([]);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("created_at");
  const [order, setOrder] = useState("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Flashcard state ──────────────────────────────────────
  const [dueWords, setDueWords] = useState([]);
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // ── Quiz state ───────────────────────────────────────────
  const [quiz, setQuiz] = useState(null);
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [quizDone, setQuizDone] = useState(false);

  // ── Load word list ───────────────────────────────────────
  const loadWords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listWords(sortBy, order);
      setWords(data.words);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sortBy, order]);

  useEffect(() => { loadWords(); }, [loadWords]);

  // ── Handlers ─────────────────────────────────────────────
  const handleDelete = async (word) => {
    try {
      await deleteWord(word);
      setWords((w) => w.filter((x) => x.word !== word));
      setTotal((t) => t - 1);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportCSV();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vocab_vault.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    }
  };

  const loadFlashcards = async () => {
    setError(null);
    try {
      const data = await getDueWords(30);
      setDueWords(data.words);
      setCardIdx(0);
      setFlipped(false);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleReview = async (quality) => {
    const word = dueWords[cardIdx];
    if (!word) return;
    try {
      await reviewWord(word.word, quality);
    } catch { /* continue */ }
    if (cardIdx + 1 < dueWords.length) {
      setCardIdx(cardIdx + 1);
      setFlipped(false);
    } else {
      setDueWords([]);
      setCardIdx(0);
    }
  };

  const startQuiz = async () => {
    setError(null);
    try {
      const data = await getQuiz(10);
      setQuiz(data.questions);
      setQIdx(0);
      setAnswers([]);
      setQuizDone(false);
    } catch (e) {
      setError(e.message);
    }
  };

  const answerQuiz = (optIdx) => {
    const correct = quiz[qIdx].correct === optIdx;
    setAnswers([...answers, { word: quiz[qIdx].word, correct, correctIdx: quiz[qIdx].correct }]);
    if (qIdx + 1 < quiz.length) {
      setQIdx(qIdx + 1);
    } else {
      setQuizDone(true);
    }
  };

  // ── Render: Tab bar ──────────────────────────────────────
  const renderTabs = () => (
    <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
      {TABS.map((t, i) => (
        <button
          key={t}
          className={`nes-btn ${i === tab ? "is-primary" : ""}`}
          style={{ fontSize: "0.5rem", padding: "8px 14px" }}
          onClick={() => {
            setTab(i);
            if (i === 1) loadFlashcards();
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );

  // ── Render: Tab 0 — Word List ────────────────────────────
  const renderWordList = () => {
    if (loading) return <p style={{ color: "#9b8ab8", fontSize: "0.55rem" }}>Loading...</p>;
    if (error) return <div className="debater-error nes-container is-rounded"><p>⚠ {error}</p></div>;
    if (words.length === 0) return (
      <div className="placeholder-box">
        <p style={{ fontSize: "0.65rem", color: "#6a5a8a", textAlign: "center" }}>
          No words yet! <br />
          Click ⭐ on words in any module to save them here.
        </p>
      </div>
    );

    return (
      <div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.5rem", color: "#9b8ab8" }}>{total} words</span>
          <select className="nes-input" style={{ fontSize: "0.45rem", width: "auto", padding: "4px 8px" }}
            value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="created_at">Date Added</option>
            <option value="word">Alphabetical</option>
            <option value="next_review">Next Review</option>
            <option value="review_count">Most Reviewed</option>
          </select>
          <button className="nes-btn is-success" style={{ fontSize: "0.4rem", padding: "6px 10px" }}
            onClick={() => setOrder(o => o === "desc" ? "asc" : "desc")}>
            {order === "desc" ? "↓ Newest" : "↑ Oldest"}
          </button>
          <button className="nes-btn is-primary" style={{ fontSize: "0.4rem", padding: "6px 10px", marginLeft: "auto" }}
            onClick={handleExport}>
            📥 CSV
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {words.map((w) => (
            <div key={w.word} className="window" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: "0.65rem", color: "#50fa7b", fontFamily: "'Press Start 2P', monospace" }}>
                  {w.word}
                </span>
                {w.phonetic && <span style={{ fontSize: "0.45rem", color: "#7a6a9a", marginLeft: 8 }}>{w.phonetic}</span>}
                <div style={{ fontSize: "0.5rem", color: "#9b8ab8", marginTop: 3 }}>{w.definition_zh || w.definition_en}</div>
              </div>
              <span style={{ fontSize: "0.4rem", color: "#4a3070", fontFamily: "'Press Start 2P', monospace" }}>
                {w.source_module}
              </span>
              <button className="nes-btn is-error" style={{ fontSize: "0.4rem", padding: "4px 8px" }}
                onClick={() => handleDelete(w.word)}>🗑</button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Render: Tab 1 — Flashcards ───────────────────────────
  const renderFlashcards = () => {
    if (dueWords.length === 0 && cardIdx === 0 && !error) {
      return (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div className="placeholder-box">
            <p style={{ fontSize: "0.65rem", color: "#6a5a8a" }}>
              🎉 All caught up! No words due for review.
            </p>
          </div>
          <button className="nes-btn is-primary" style={{ fontSize: "0.5rem", marginTop: 16 }}
            onClick={loadFlashcards}>🔄 Refresh</button>
        </div>
      );
    }

    const card = dueWords[cardIdx];
    if (!card) {
      return <p style={{ color: "#9b8ab8", fontSize: "0.55rem" }}>Loading flashcards...</p>;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <p style={{ fontSize: "0.5rem", color: "#9b8ab8" }}>
          Card {cardIdx + 1} of {dueWords.length}
        </p>

        {/* ── Card ──────────────────────────────────────── */}
        <div
          className="window"
          onClick={() => setFlipped(!flipped)}
          style={{
            width: "100%", maxWidth: 420, minHeight: 200,
            cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "32px 24px",
            transition: "transform 0.3s, background 0.3s",
            background: flipped ? "#0a1a10" : "#1a0a30",
          }}
        >
          {!flipped ? (
            <>
              <div style={{ fontSize: "1.8rem", fontFamily: "'Press Start 2P', monospace", color: "#50fa7b", textShadow: "2px 2px 0 #0d400d", textAlign: "center" }}>
                {card.word}
              </div>
              {card.phonetic && <div style={{ fontSize: "0.6rem", color: "#7a6a9a", marginTop: 8 }}>{card.phonetic}</div>}
              <div style={{ fontSize: "0.4rem", color: "#4a3070", marginTop: 12 }}>click to flip</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: "0.55rem", color: "#d0c8e8", textAlign: "center", lineHeight: 1.8 }}>
                {card.definition_en || "(no definition)"}
              </div>
              <div style={{ fontSize: "0.65rem", color: "#50fa7b", marginTop: 8, textAlign: "center" }}>
                {card.definition_zh || ""}
              </div>
              {card.example_sentence && (
                <div style={{ fontSize: "0.5rem", color: "#9b8ab8", marginTop: 10, textAlign: "center", fontStyle: "italic" }}>
                  "{card.example_sentence}"
                </div>
              )}
              <div style={{ fontSize: "0.4rem", color: "#4a3070", marginTop: 8 }}>
                from: {card.source_module || "unknown"}
              </div>
            </>
          )}
        </div>

        {/* ── Rating buttons ─────────────────────────────── */}
        {flipped && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            {QUALITY_LABELS.map(({ q, label, cls }) => (
              <button key={q} className={`nes-btn ${cls}`} style={{ fontSize: "0.5rem" }}
                onClick={() => handleReview(q)}>{label}</button>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── Render: Tab 2 — Quiz ─────────────────────────────────
  const renderQuiz = () => {
    if (!quiz) {
      return (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <p style={{ fontSize: "0.55rem", color: "#9b8ab8", marginBottom: 16 }}>
            Test yourself with 10 multiple-choice questions from your Vocab Vault.
          </p>
          <button className="nes-btn is-primary" style={{ fontSize: "0.55rem" }}
            onClick={startQuiz} disabled={total < 4}>
            {total < 4 ? "Need at least 4 words in vault" : "🎯 Start Quiz"}
          </button>
        </div>
      );
    }

    if (quizDone) {
      const correct = answers.filter((a) => a.correct).length;
      return (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <p style={{ fontSize: "0.65rem", color: "#50fa7b", fontFamily: "'Press Start 2P', monospace", marginBottom: 12 }}>
            {correct} / {answers.length} ({Math.round((correct / answers.length) * 100)}%)
          </p>
          {/* Show wrong answers */}
          {answers.filter((a) => !a.correct).map((a, i) => {
            const opt = quiz[i + answers.findIndex((x) => x.word === a.word)];
            return (
              <div key={i} className="window" style={{ padding: "10px 14px", marginBottom: 8, textAlign: "left" }}>
                <span style={{ fontSize: "0.55rem", color: "#50fa7b" }}>{a.word}</span>
                <span style={{ fontSize: "0.45rem", color: "#ff6b8a", marginLeft: 8 }}>✗ {opt?.options[a.correctIdx]}</span>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
            <button className="nes-btn is-primary" style={{ fontSize: "0.5rem" }} onClick={startQuiz}>🔄 Retry</button>
            <button className="nes-btn" style={{ fontSize: "0.5rem" }} onClick={() => setQuiz(null)}>Back</button>
          </div>
        </div>
      );
    }

    const q = quiz[qIdx];
    return (
      <div style={{ maxWidth: 500, margin: "0 auto" }}>
        <p style={{ fontSize: "0.5rem", color: "#9b8ab8", marginBottom: 10 }}>
          Question {qIdx + 1} of {quiz.length}
        </p>
        <div className="window" style={{ padding: "24px 20px", textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: "1.2rem", fontFamily: "'Press Start 2P', monospace", color: "#50fa7b", marginBottom: 6 }}>
            {q.word}
          </div>
          {q.phonetic && <div style={{ fontSize: "0.55rem", color: "#7a6a9a" }}>{q.phonetic}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {q.options.map((opt, i) => (
            <button key={i} className="nes-btn" style={{ fontSize: "0.5rem", textAlign: "left", padding: "12px 16px" }}
              onClick={() => answerQuiz(i)}>
              {String.fromCharCode(65 + i)}. {opt}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="page-content">
      <header>
        <h1>📚 Vocab Vault</h1>
        <p>Your personal vocabulary treasure — collected from all learning modules</p>
      </header>

      {renderTabs()}

      <main style={{ display: "block", flex: 1 }}>
        {tab === 0 && renderWordList()}
        {tab === 1 && renderFlashcards()}
        {tab === 2 && renderQuiz()}
      </main>
    </div>
  );
}
