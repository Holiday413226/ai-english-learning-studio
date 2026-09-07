/**
 * Vocab Vault page — three tabs: Word List, Flashcards, Quiz.
 *
 * Uses NES.css styling for the pixel retro look consistent with the app theme.
 */
import { useState, useEffect, useCallback } from "react";
import useConfigStore from "../../store/configStore";
import { listWords, deleteWord, reviewWord, getFlashcards, getQuiz, exportCSV } from "./api";

const TABS = ["单词列表", "闪卡", "测验"];

const QUALITY_LABELS = [
  { q: 0, label: "忘记了", cls: "is-error" },
  { q: 3, label: "不确定", cls: "is-warning" },
  { q: 5, label: "会了", cls: "is-success" },
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
  const [flashcardLoading, setFlashcardLoading] = useState(false);

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

  const loadFlashcards = useCallback(async () => {
    setError(null);
    setFlashcardLoading(true);
    try {
      const data = await getFlashcards(30);
      setDueWords(data.words);
      setCardIdx(0);
      setFlipped(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setFlashcardLoading(false);
    }
  }, []);

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
          style={{ fontSize: "0.75rem", padding: "8px 14px", whiteSpace: "nowrap" }}
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
    if (loading) return <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>加载中…</p>;
    if (error) return <div className="debater-error"><p>{error}</p></div>;
    if (words.length === 0) return (
      <div className="placeholder-box">
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", textAlign: "center" }}>
          还没有单词！<br />
          在任意模块点击单词旁的星星收藏到这里。
        </p>
      </div>
    );

    return (
      <div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{total} 个单词</span>
          <select className="nes-input" style={{ fontSize: "0.7rem", width: "auto", padding: "4px 8px" }}
            value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="created_at">添加时间</option>
            <option value="word">字母顺序</option>
            <option value="next_review">下次复习</option>
            <option value="review_count">复习次数</option>
          </select>
          <button className="nes-btn is-success" style={{ fontSize: "0.65rem", padding: "6px 10px" }}
            onClick={() => setOrder(o => o === "desc" ? "asc" : "desc")}>
            {order === "desc" ? "最新" : "最旧"}
          </button>
          <button className="nes-btn is-primary" style={{ fontSize: "0.65rem", padding: "6px 10px", marginLeft: "auto" }}
            onClick={handleExport}>
            导出 CSV
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {words.map((w) => (
            <div key={w.word} className="window" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: "0.85rem", color: "var(--accent)", fontFamily: "var(--font-mono)" }}>
                  {w.word}
                </span>
                {w.phonetic && <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginLeft: 8 }}>{w.phonetic}</span>}
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 3 }}>{w.definition_zh || w.definition_en}</div>
              </div>
              <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                {w.source_module}
              </span>
              <button className="nes-btn is-error" style={{ fontSize: "0.65rem", padding: "4px 8px" }}
                onClick={() => handleDelete(w.word)}>删除</button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Render: Tab 1 — Flashcards ───────────────────────────
  const renderFlashcards = () => {
    if (flashcardLoading) {
      return (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>加载闪卡中…</p>
        </div>
      );
    }

    if (error && dueWords.length === 0) {
      return (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div className="debater-error">
            <p>{error}</p>
          </div>
          <button className="nes-btn is-primary" style={{ fontSize: "0.75rem", marginTop: 16 }}
            onClick={loadFlashcards}>重试</button>
        </div>
      );
    }

    if (dueWords.length === 0 && cardIdx === 0) {
      return (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div className="placeholder-box">
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              本轮复习完成！点击「刷新」可重新再练一遍。
            </p>
          </div>
          <button className="nes-btn is-primary" style={{ fontSize: "0.75rem", marginTop: 16 }}
            onClick={loadFlashcards}>刷新</button>
        </div>
      );
    }

    const card = dueWords[cardIdx];
    if (!card) {
      return <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>加载闪卡中…</p>;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
          第 {cardIdx + 1} / {dueWords.length} 张
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
            background: flipped ? "rgba(80, 250, 123, 0.06)" : "var(--bg-card)",
          }}
        >
          {!flipped ? (
            <>
              <div style={{ fontSize: "1.8rem", fontFamily: "var(--font-mono)", color: "var(--accent)", textShadow: "0 0 20px rgba(80, 250, 123, 0.15)", textAlign: "center" }}>
                {card.word}
              </div>
              {card.phonetic && <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 8 }}>{card.phonetic}</div>}
              <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 12 }}>点击翻面</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: "0.8rem", color: "var(--text-primary)", textAlign: "center", lineHeight: 1.8 }}>
                {card.definition_en || "(no definition)"}
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--accent)", marginTop: 8, textAlign: "center" }}>
                {card.definition_zh || ""}
              </div>
              {card.example_sentence && (
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 10, textAlign: "center", fontStyle: "italic" }}>
                  &ldquo;{card.example_sentence}&rdquo;
                </div>
              )}
              <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 8 }}>
                来自：{card.source_module || "未知"}
              </div>
            </>
          )}
        </div>

        {/* ── Rating buttons ─────────────────────────────── */}
        {flipped && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            {QUALITY_LABELS.map(({ q, label, cls }) => (
              <button key={q} className={`nes-btn ${cls}`} style={{ fontSize: "0.75rem" }}
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
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: 16 }}>
            用词汇库中的 10 道选择题测试自己。
          </p>
          <button className="nes-btn is-primary" style={{ fontSize: "0.8rem" }}
            onClick={startQuiz} disabled={total < 4}>
            {total < 4 ? "词汇库中至少需要 4 个单词" : "开始测验"}
          </button>
        </div>
      );
    }

    if (quizDone) {
      const correct = answers.filter((a) => a.correct).length;
      return (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <p style={{ fontSize: "0.85rem", color: "var(--accent)", fontFamily: "var(--font-mono)", marginBottom: 12 }}>
            {correct} / {answers.length} ({Math.round((correct / answers.length) * 100)}%)
          </p>
          {/* Show wrong answers */}
          {answers.filter((a) => !a.correct).map((a, i) => {
            const opt = quiz[i + answers.findIndex((x) => x.word === a.word)];
            return (
              <div key={i} className="window" style={{ padding: "10px 14px", marginBottom: 8, textAlign: "left" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--accent)" }}>{a.word}</span>
                <span style={{ fontSize: "0.7rem", color: "var(--danger)", marginLeft: 8 }}>正确答案：{opt?.options[a.correctIdx]}</span>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
            <button className="nes-btn is-primary" style={{ fontSize: "0.75rem" }} onClick={startQuiz}>重试</button>
            <button className="nes-btn" style={{ fontSize: "0.75rem" }} onClick={() => setQuiz(null)}>返回</button>
          </div>
        </div>
      );
    }

    const q = quiz[qIdx];
    return (
      <div style={{ maxWidth: 500, margin: "0 auto" }}>
        <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: 10 }}>
          第 {qIdx + 1} / {quiz.length} 题
        </p>
        <div className="window" style={{ padding: "24px 20px", textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: "1.3rem", fontFamily: "var(--font-mono)", color: "var(--accent)", marginBottom: 6 }}>
            {q.word}
          </div>
          {q.phonetic && <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{q.phonetic}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {q.options.map((opt, i) => (
            <button key={i} className="nes-btn" style={{ fontSize: "0.75rem", textAlign: "left", padding: "12px 16px" }}
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
        <h1>词汇库</h1>
        <p>你的个人词汇宝库——来自所有学习模块</p>
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
