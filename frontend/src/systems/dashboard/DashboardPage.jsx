/**
 * Dashboard page — learning overview with stats + module quick-launch cards.
 *
 * Fetches from GET /api/dashboard/stats on mount.
 * Each module card navigates to the corresponding page.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getDashboardStats } from "./api";

const MODULES = [
  { path: "/novel",      label: "Novel Translator", icon: "📖", desc: "Translate Chinese novels with CET vocab highlights" },
  { path: "/diary",      label: "English Diary",    icon: "✍️", desc: "Write daily diary with AI corrections & scoring" },
  { path: "/debater",    label: "Debater",          icon: "⚔️", desc: "Practice English debate & discussion with AI" },
  { path: "/minecrafter",label: "Minecraft",        icon: "⛏️", desc: "Chat with your AI companion inside Minecraft" },
  { path: "/vocab",      label: "Vocab Vault",      icon: "📚", desc: "Flashcards & quizzes from all your saved words" },
];

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    getDashboardStats()
      .then((data) => { if (!cancelled) setStats(data); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="page-content">
        <header>
          <h1>🏠 Dashboard</h1>
        </header>
        <div className="debater-error nes-container is-rounded">
          <p>⚠ Failed to load stats: {error}</p>
        </div>
      </div>
    );
  }

  const today = stats?.today || {};
  const streak = stats?.streak ?? 0;
  const totalVocab = stats?.total_vocab ?? 0;
  const modules = stats?.modules || {};

  return (
    <div className="page-content">
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: "1.2rem" }}>🏠 AI English Studio</h1>
        <p style={{ fontSize: "0.55rem" }}>Your complete English learning companion</p>
      </header>

      {/* ── Today's Stats ───────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Chars Translated", value: today.novel_chars ?? 0, icon: "📖" },
          { label: "Diary Entries",    value: today.diary_count ?? 0, icon: "✍️" },
          { label: "Debate Rounds",    value: today.debate_rounds ?? 0, icon: "⚔️" },
          { label: "Words Saved",      value: today.vocab_added ?? 0, icon: "⭐" },
        ].map((s) => (
          <div key={s.label}
            className="window"
            style={{ flex: "1 1 160px", textAlign: "center", padding: "16px 12px" }}
          >
            <div style={{ fontSize: "1.6rem", marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: "1.4rem", fontFamily: "'Press Start 2P', monospace", color: "#50fa7b", textShadow: "2px 2px 0 #0d400d" }}>
              {s.value}
            </div>
            <div style={{ fontSize: "0.5rem", color: "#9b8ab8", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Streak + Total Vocab ─────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <div className="window" style={{ flex: 1, textAlign: "center", padding: "14px" }}>
          <span style={{ fontSize: "0.55rem", color: "#9b8ab8" }}>🔥 Streak</span>
          <br />
          <span style={{ fontSize: "1.2rem", fontFamily: "'Press Start 2P', monospace", color: "#50fa7b" }}>
            {streak} {streak === 0 ? "day" : "days"}
          </span>
        </div>
        <div className="window" style={{ flex: 1, textAlign: "center", padding: "14px" }}>
          <span style={{ fontSize: "0.55rem", color: "#9b8ab8" }}>📚 Total Vocab</span>
          <br />
          <span style={{ fontSize: "1.2rem", fontFamily: "'Press Start 2P', monospace", color: "#50fa7b" }}>
            {totalVocab} words
          </span>
        </div>
      </div>

      {/* ── Module Quick-Launch Cards ────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {MODULES.map((m) => (
          <button
            key={m.path}
            className="window"
            onClick={() => navigate(m.path)}
            style={{
              flex: "1 1 200px",
              cursor: "pointer",
              textAlign: "left",
              border: "none",
              padding: "18px",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#50fa7b"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#5a2d8a"; }}
          >
            <div style={{ fontSize: "1.5rem", marginBottom: 6 }}>{m.icon}</div>
            <div style={{ fontSize: "0.55rem", fontFamily: "'Press Start 2P', monospace", color: "#50fa7b", marginBottom: 4 }}>
              {m.label}
            </div>
            <div style={{ fontSize: "0.45rem", color: "#6a5a8a", lineHeight: 1.6 }}>
              {m.desc}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
