/**
 * Dashboard page — learning overview with stats + module quick-launch cards.
 *
 * Fetches from GET /api/dashboard/stats on mount.
 * Each module card navigates to the corresponding page.
 */
import { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { getDashboardStats } from "./api";
import { SettingsContext } from "../../App";

const MODULES = [
  { path: "/novel",      label: "Novel Translator", desc: "Translate Chinese novels with CET vocab highlights" },
  { path: "/diary",      label: "English Diary",    desc: "Write daily diary with AI corrections & scoring" },
  { path: "/debater",    label: "Debater",          desc: "Practice English debate & discussion with AI" },
  { path: "/minecrafter",label: "Minecraft",        desc: "Chat with your AI companion inside Minecraft" },
  { path: "/vocab",      label: "Vocab Vault",      desc: "Flashcards & quizzes from all your saved words" },
];

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { openSettings } = useContext(SettingsContext);

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
          <h1>Dashboard</h1>
        </header>
        <div className="debater-error">
          <p>Failed to load stats: {error}</p>
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
      <header>
        <div>
          <h1><span className="logo-glitch" id="main-title-glitch">AI English Studio</span></h1>
          <p>Your complete English learning companion</p>
        </div>
        <button
          className="nes-btn is-warning"
          onClick={openSettings}
          title="API Settings"
          style={{ flexShrink: 0 }}
        >
          Settings
        </button>
      </header>

      {/* ── Today's Stats ───────────────────────────────────── */}
      <div className="stats-row">
        {[
          { label: "Chars Translated", value: today.novel_chars ?? 0 },
          { label: "Diary Entries",    value: today.diary_count ?? 0 },
          { label: "Debate Rounds",    value: today.debate_rounds ?? 0 },
          { label: "Words Saved",      value: today.vocab_added ?? 0 },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div className="stat-value">{s.value.toLocaleString()}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Streak + Total Vocab ─────────────────────────────── */}
      <div className="stats-row">
        <div className="stat-card" style={{ flex: 1 }}>
          <div className="stat-value">{streak} {streak === 0 ? "day" : "days"}</div>
          <div className="stat-label">Streak</div>
        </div>
        <div className="stat-card" style={{ flex: 1 }}>
          <div className="stat-value">{totalVocab} words</div>
          <div className="stat-label">Total Vocab</div>
        </div>
      </div>

      {/* ── Module Quick-Launch Cards ────────────────────────── */}
      <div className="section-title">Learning Modules</div>
      <div className="module-grid">
        {MODULES.map((m) => (
          <div
            key={m.path}
            className="module-card"
            onClick={() => navigate(m.path)}
          >
            <h3>{m.label}</h3>
            <p>{m.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}