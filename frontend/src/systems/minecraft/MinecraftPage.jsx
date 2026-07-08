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
import { getCompanionStatus, getCompanionSessions, getCompanionSession } from "./api";

export default function MinecraftPage() {
  const deepseekApiKey = useConfigStore((s) => s.deepseekApiKey);

  const [status, setStatus] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [st, ss] = await Promise.all([
        getCompanionStatus(),
        getCompanionSessions(),
      ]);
      setStatus(st);
      setSessions(ss.sessions || []);
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

  return (
    <div className="page-content">
      <header>
        <h1>⛏ Minecraft Companion</h1>
        <p>PCL chat in-game + Web panel for review &amp; vocab collection</p>
      </header>

      <main className="debater-main">
        {/* ── Left sidebar — Session list ─────────────────── */}
        <div className="debater-sessions" style={{ width: 220 }}>
          {/* Bot Status */}
          <div style={{ padding: "10px 12px", borderBottom: "2px solid #3d1a60" }}>
            <div style={{ fontSize: "0.5rem", color: "#9b8ab8", fontFamily: "'Press Start 2P', monospace" }}>
              Bot:{" "}
              <span style={{ color: status?.bot_online ? "#50fa7b" : "#ff6b8a" }}>
                {status?.bot_online ? "ONLINE" : "OFFLINE"}
              </span>
            </div>
            {status?.bot_name && (
              <div style={{ fontSize: "0.4rem", color: "#6a5a8a", marginTop: 2 }}>
                {status.bot_name}
              </div>
            )}
          </div>

          {/* Sessions list */}
          <div className="debater-sessions-list" style={{ flex: 1, overflowY: "auto" }}>
            {sessions.length === 0 && (
              <p style={{ fontSize: "0.45rem", color: "#4a3070", textAlign: "center", padding: "16px 8px" }}>
                No sessions yet.<br />
                Start a conversation in PCL!
              </p>
            )}
            {sessions.map((s) => (
              <div
                key={s.session_id}
                className={`debater-session-item ${currentSession === s.session_id ? "active" : ""}`}
                onClick={() => loadSession(s.session_id)}
              >
                <span className="debater-session-mode">💬</span>
                <span className="debater-session-preview">
                  {s.preview || "New session"}
                </span>
              </div>
            ))}
          </div>

          {/* Refresh button */}
          <div style={{ padding: "8px 10px", borderTop: "2px solid #3d1a60" }}>
            <button className="nes-btn is-primary" style={{ fontSize: "0.4rem", width: "100%", padding: "6px" }}
              onClick={refresh} disabled={loading}>
              🔄 Refresh{lastRefresh ? ` (${lastRefresh})` : ""}
            </button>
          </div>
        </div>

        {/* ── Right area — Messages ───────────────────────── */}
        <div className="debater-chat" style={{ flex: 1 }}>
          <div className="debater-messages" style={{ flex: 1 }}>
            {error && (
              <div className="debater-error nes-container is-rounded">
                <p>⚠ {error}</p>
              </div>
            )}

            {messages.length === 0 && !currentSession && (
              <div className="debater-welcome">
                <p>
                  🤖 Your Minecraft companion is ready.<br /><br />
                  Chat with the AI bot <strong>inside Minecraft (PCL)</strong> —<br />
                  your conversation will appear here.<br /><br />
                  <span style={{ fontSize: "0.45rem", color: "#6a5a8a" }}>
                    ⭐ Select words from bot messages to save to Vocab Vault.
                  </span>
                </p>
              </div>
            )}

            {messages.length === 0 && currentSession && (
              <p style={{ textAlign: "center", color: "#6a5a8a", fontSize: "0.55rem", padding: "30px 0" }}>
                No messages in this session yet.
              </p>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`debater-bubble ${msg.role === "user" ? "debater-bubble--user" : ""}`}
              >
                <span className="debater-bubble-avatar">
                  {msg.role === "user" ? "🧑" : "🤖"}
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
            <span style={{ fontSize: "0.45rem", color: "#6a5a8a" }}>
              ⚠ Messages are sent inside <strong>PCL / Minecraft</strong> chat, not here.
            </span>
            <span style={{ fontSize: "0.45rem", color: "#4a3070" }}>
              This panel is for <strong>review &amp; vocab</strong> only.
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
