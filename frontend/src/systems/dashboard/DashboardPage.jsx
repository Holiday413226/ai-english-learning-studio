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
  { path: "/novel",      label: "小说翻译", desc: "翻译中文小说并高亮四六级词汇" },
  { path: "/diary",      label: "英语日记", desc: "每日写日记，AI 批改与评分" },
  { path: "/debater",    label: "辩论",   desc: "与 AI 练习英语辩论与讨论" },
  { path: "/minecrafter",label: "我的世界", desc: "在 Minecraft 中与 AI 伙伴对话" },
  { path: "/vocab",      label: "词汇库", desc: "用收藏的单词进行闪卡与测验" },
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
          <h1>仪表盘</h1>
        </header>
        <div className="debater-error">
          <p>加载统计失败：{error}</p>
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
          <h1><span className="logo-glitch" id="main-title-glitch">AI 英语学习工作室</span></h1>
          <p>你的全能英语学习伙伴</p>
        </div>
        <button
          className="nes-btn is-warning"
          onClick={openSettings}
          title="API 设置"
          style={{ flexShrink: 0 }}
        >
          设置
        </button>
      </header>

      {/* ── Today's Stats ───────────────────────────────────── */}
      <div className="stats-row">
        {[
          { label: "翻译字数", value: today.novel_chars ?? 0 },
          { label: "日记篇数", value: today.diary_count ?? 0 },
          { label: "辩论轮次", value: today.debate_rounds ?? 0 },
          { label: "收藏单词", value: today.vocab_added ?? 0 },
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
          <div className="stat-value">{streak} 天</div>
          <div className="stat-label">连续天数</div>
        </div>
        <div className="stat-card" style={{ flex: 1 }}>
          <div className="stat-value">{totalVocab} 个单词</div>
          <div className="stat-label">总词汇</div>
        </div>
      </div>

      {/* ── Module Quick-Launch Cards ────────────────────────── */}
      <div className="section-title">学习模块</div>
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