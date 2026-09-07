/**
 * Minecraft Companion Page — read-only conversation log + vocabulary collection.
 *
 * Users chat with the AI bot INSIDE Minecraft (PCL game chat).
 * This web panel shows the conversation history and supports ⭐ word collection.
 * There is NO message-sending UI — that stays in the game.
 */
import { useState, useEffect, useCallback } from "react";
import useConfigStore from "../../store/configStore";
import VocabStar from "../../components/vocab/VocabStar";
import { getCompanionStatus, getCompanionSessions, getCompanionSession,
         getBridgeStatus, startMinebotBridge, stopMinebotBridge,
         getLayers, setLayers } from "./api";

const LAYER_META = [
  { key: "intent",       label: "意图识别", desc: "解析自然语言为动作" },
  { key: "persona_gate", label: "人格决策", desc: "接受/拒绝/改写动作" },
  { key: "expression",   label: "动作叙述", desc: "用自然语言叙述动作" },
  { key: "autonomy",     label: "自主行为", desc: "主动探索/自我提示" },
];

const LAYER_PRESETS = [
  { name: "工具人", layers: { intent: true, persona_gate: false, expression: true,  autonomy: false } },
  { name: "完整人格", layers: { intent: true, persona_gate: true,  expression: true,  autonomy: true } },
];

export default function MinecraftPage() {
  const deepseekApiKey = useConfigStore((s) => s.deepseekApiKey);

  const [status, setStatus] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  // Bridge state
  const [bridgeStatus, setBridgeStatus] = useState(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  // Layer selector state
  const [layers, setLayersState] = useState(null);
  const [layersSaving, setLayersSaving] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [st, ss, bs] = await Promise.all([
        getCompanionStatus(),
        getCompanionSessions(),
        getBridgeStatus(),
      ]);
      setStatus(st);
      setSessions(ss.sessions || []);
      setBridgeStatus(bs);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const loadSession = async (sessionId) => {
    setError(null);
    try {
      const data = await getCompanionSession(sessionId);
      setCurrentSession(sessionId);
      setMessages(data.messages || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const startMinebot = async () => {
    setError(null);
    setStarting(true);
    try {
      const result = await startMinebotBridge();
      if (result.status === "error") {
        setError(result.message);
      }
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  };

  const stopMinebot = async () => {
    setError(null);
    setStopping(true);
    try {
      await stopMinebotBridge();
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setStopping(false);
    }
  };

  const loadLayers = useCallback(async () => {
    try {
      const data = await getLayers();
      setLayersState(data.layers || null);
    } catch {
      // layer selector is optional — ignore fetch errors
    }
  }, []);

  useEffect(() => { loadLayers(); }, [loadLayers]);

  const toggleLayer = async (key) => {
    if (!layers) return;
    const prev = layers;
    const next = { ...layers, [key]: !layers[key] };
    setLayersState(next);
    setLayersSaving(true);
    try {
      const data = await setLayers(next);
      setLayersState(data.layers || next);
    } catch (err) {
      setError(err.message);
      setLayersState(prev);
    } finally {
      setLayersSaving(false);
    }
  };

  const applyPreset = async (preset) => {
    setLayersSaving(true);
    try {
      const data = await setLayers(preset);
      setLayersState(data.layers || preset);
    } catch (err) {
      setError(err.message);
    } finally {
      setLayersSaving(false);
    }
  };

  return (
    <div className="page-content">
      <header>
        <h1>我的世界 AI 伙伴</h1>
        <p>PCL 游戏内对话 + 网页面板用于复盘与词汇收藏</p>
      </header>

      <main className="debater-main">
        {/* ── Left sidebar — Session list ─────────────────── */}
        <div className="debater-sessions" style={{ width: 220 }}>
          {/* Bot Status */}
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-default)" }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
              机器人：{" "}
              <span style={{ color: status?.bot_online ? "var(--accent)" : "var(--danger)" }}>
                {status?.bot_online ? "在线" : "离线"}
              </span>
            </div>
            {status?.bot_name && (
              <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", marginTop: 2 }}>
                {status.bot_name}
              </div>
            )}

            {/* Minebot process control */}
            <div style={{ fontSize: "0.6rem", color: "var(--text-secondary)", marginTop: 8 }}>
              思维服务：{" "}
              <span style={{ color: bridgeStatus?.minebot_running ? "var(--accent)" : "var(--danger)" }}>
                {bridgeStatus?.minebot_running ? "运行中" : "已停止"}
              </span>
            </div>
            {!bridgeStatus?.minebot_running ? (
              <button
                className="nes-btn is-success"
                style={{ fontSize: "0.65rem", width: "100%", padding: "6px", marginTop: 6 }}
                onClick={startMinebot}
                disabled={starting}
              >
                {starting ? "启动中…" : "启动 Minebot"}
              </button>
            ) : (
              <button
                className="nes-btn is-error"
                style={{ fontSize: "0.65rem", width: "100%", padding: "6px", marginTop: 6 }}
                onClick={stopMinebot}
                disabled={stopping}
              >
                {stopping ? "停止中…" : "停止 Minebot"}
              </button>
            )}
          </div>

          {/* Layer selector */}
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-default)" }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", marginBottom: 6 }}>
              图层选择
              <span style={{ fontSize: "0.55rem", color: "var(--text-muted)" }}>（改动后需重启 Minebot）</span>
            </div>
            {layers ? (
              <>
                {LAYER_META.map((m) => (
                  <label
                    key={m.key}
                    style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.62rem", color: "var(--text-secondary)", marginBottom: 4, cursor: "pointer" }}
                  >
                    <input
                      type="checkbox"
                      checked={!!layers[m.key]}
                      onChange={() => toggleLayer(m.key)}
                      disabled={layersSaving}
                    />
                    <span>{m.label}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.55rem" }}>{m.desc}</span>
                  </label>
                ))}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  {LAYER_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      className="nes-btn is-primary"
                      style={{ fontSize: "0.6rem", padding: "4px 8px" }}
                      onClick={() => applyPreset(p.layers)}
                      disabled={layersSaving}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>加载中…</p>
            )}
          </div>

          {/* Sessions list */}
          <div className="debater-sessions-list" style={{ flex: 1, overflowY: "auto" }}>
            {sessions.length === 0 && (
              <p style={{ fontSize: "0.65rem", color: "var(--text-muted)", textAlign: "center", padding: "16px 8px" }}>
                暂无对话。<br />
                在 PCL 中开始对话吧！
              </p>
            )}
            {sessions.map((s) => (
              <div
                key={s.session_id}
                className={`debater-session-item ${currentSession === s.session_id ? "active" : ""}`}
                onClick={() => loadSession(s.session_id)}
              >
                <span className="debater-session-mode" style={{ fontSize: "12px" }}>对话</span>
                <span className="debater-session-preview">
                  {s.preview || "新对话"}
                </span>
              </div>
            ))}
          </div>

          {/* Refresh button */}
          <div style={{ padding: "8px 10px", borderTop: "1px solid var(--border-default)" }}>
            <button className="nes-btn is-primary" style={{ fontSize: "0.65rem", width: "100%", padding: "6px" }}
              onClick={refresh} disabled={loading}>
              刷新{lastRefresh ? ` (${lastRefresh})` : ""}
            </button>
          </div>
        </div>

        {/* ── Right area — Messages ───────────────────────── */}
        <div className="debater-chat" style={{ flex: 1 }}>
          <div className="debater-messages" style={{ flex: 1 }}>
            {error && (
              <div className="debater-error">
                <p>{error}</p>
              </div>
            )}

            {messages.length === 0 && !currentSession && (
              <div className="debater-welcome">
                <p>
                  你的我的世界 AI 伙伴已就绪。<br /><br />
                  在 <strong>Minecraft（PCL）</strong> 中与 AI 机器人对话——<br />
                  你们的对话会显示在这里。<br /><br />
                  <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                    从机器人消息中选择单词收藏到词汇库。
                  </span>
                </p>
              </div>
            )}

            {messages.length === 0 && currentSession && (
              <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.75rem", padding: "30px 0" }}>
                该对话暂无消息。
              </p>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`debater-bubble ${msg.role === "user" ? "debater-bubble--user" : ""}`}
              >
                <span className="debater-bubble-avatar">
                  {msg.role === "user" ? "你" : "AI"}
                </span>
                <div className={`debater-bubble-content ${msg.role === "user" ? "is-user" : "is-ai"}`}>
                  <p>{msg.content}</p>
                  {/* VocabStar on bot messages */}
                  {msg.role === "assistant" && (
                    <div style={{ marginTop: 4 }}>
                      <VocabStar
                        word={msg.content?.split(" ").slice(0, 3).join(" ") + "..."}
                        context={msg.content?.slice(0, 100)}
                        sourceModule="minecraft"
                        apiKey={deepseekApiKey}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ── Info bar ──────────────────────────────────── */}
          <div className="debater-input-bar" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
              消息在 <strong>PCL / Minecraft</strong> 游戏内发送，不在这里。
            </span>
            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
              此面板仅用于 <strong>复盘与词汇</strong>。
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
