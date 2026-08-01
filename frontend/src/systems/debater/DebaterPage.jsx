/**
 * DebaterPage — COZE-powered English debate / discussion with voice.
 *
 * Layout:
 *   +--------------------+----------------------------+
 *   | SessionSidebar     | Message list (scrollable)  |
 *   | (left, 220px)      |                            |
 *   |                    | ChatBubble x N             |
 *   | - New Chat btn     |                            |
 *   | - Settings btn     +----------------------------+
 *   | - Session list     | ChatInput (bottom bar)     |
 *   |                    | - Toggles (mode, voice)    |
 *   |                    | - Text input or VoiceBtn   |
 *   +--------------------+----------------------------+
 *
 * API keys and Bot IDs come from global configStore.
 * Messages and sessions are in the subsystem store.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import SessionSidebar from "../../components/debater/SessionSidebar";
import SetupModal from "../../components/SetupModal";
import ChatBubble from "../../components/debater/ChatBubble";
import ChatInput from "../../components/debater/ChatInput";
import useConfigStore from "../../store/configStore";
import useDebaterStore, { VoiceState } from "./store";
import { postChat, getDebateScore, getSessions, getSession } from "./api";

export default function DebaterPage() {
  // ── Global config ──────────────────────────────────────────
  const cozeApiKey = useConfigStore((s) => s.cozeApiKey);
  const cozeApiUrl = useConfigStore((s) => s.cozeApiUrl);
  const debateBotId = useConfigStore((s) => s.debateBotId);
  const discussBotId = useConfigStore((s) => s.discussBotId);
  const deepseekApiKey = useConfigStore((s) => s.deepseekApiKey);

  // ── Subsystem state ────────────────────────────────────────
  const {
    sessions,
    currentSessionId,
    createSession,
    setCurrentSessionId,
    addMessage,
    mode,
    setMode,
    voiceState,
    setVoiceState,
  } = useDebaterStore();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsKey, setSettingsKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [scoreResult, setScoreResult] = useState(null);
  const messagesEndRef = useRef(null);

  // First-launch: if no COZE API key, force settings modal
  useEffect(() => {
    if (!cozeApiKey && !debateBotId && !discussBotId) {
      setSettingsOpen(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ensure a session exists on mount AND load sessions from backend
  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      try {
        const data = await getSessions();
        if (cancelled) return;

        if (data.sessions && data.sessions.length > 0) {
          // Load all sessions in parallel
          await Promise.all(data.sessions.map(async (s) => {
            try {
              const full = await getSession(s.session_id);
              if (full.messages && !cancelled) {
                useDebaterStore.setState((state) => ({
                  sessions: {
                    ...state.sessions,
                    [s.session_id]: {
                      mode: full.mode || "debate",
                      messages: full.messages,
                      createdAt: full.created_at || Date.now(),
                      updatedAt: full.updated_at || Date.now(),
                    },
                  },
                }));
              }
            } catch {
              // skip sessions that fail to load
            }
          }));

          if (!cancelled) {
            // Set current session to latest
            const latest = data.sessions.sort((a, b) => b.updated_at - a.updated_at)[0];
            if (latest?.session_id) {
              setCurrentSessionId(latest.session_id);
            }
          }
        }

        // After all backend data is loaded, create a new session only if truly empty
        if (!cancelled) {
          const ids = Object.keys(useDebaterStore.getState().sessions);
          if (ids.length === 0) {
            createSession();
          } else {
            // Ensure currentSessionId is set to the latest
            const currentState = useDebaterStore.getState();
            const latestId = Object.keys(currentState.sessions).sort(
              (a, b) => (currentState.sessions[b]?.updatedAt || 0) - (currentState.sessions[a]?.updatedAt || 0)
            )[0];
            if (latestId && !currentState.currentSessionId) {
              setCurrentSessionId(latestId);
            }
          }
        }
      } catch {
        // Backend unavailable — create a local session
        if (!cancelled) {
          const ids = Object.keys(useDebaterStore.getState().sessions);
          if (ids.length === 0) {
            createSession();
          }
        }
      }
    }

    loadSessions();

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessions, currentSessionId]);

  // ── Scoring handler ──────────────────────────────────────
  const handleScore = useCallback(async () => {
    if (!deepseekApiKey || !currentSessionId) return;
    setScoring(true);
    setScoreResult(null);
    try {
      const result = await getDebateScore(deepseekApiKey, currentSessionId);
      setScoreResult(result);
    } catch (err) {
      setScoreResult({ error: err.message });
    } finally {
      setScoring(false);
    }
  }, [deepseekApiKey, currentSessionId]);

  // ── Send message handler ─────────────────────────────────
  const handleSend = useCallback(
    async (text) => {
      setError(null);
      const botId = mode === "debate" ? debateBotId : discussBotId;

      if (!botId) {
        setError(
          `No Bot ID configured for ${mode} mode. Click ⚙ to open Settings.`
        );
        return;
      }

      if (!cozeApiKey) {
        setError("COZE API Key is required. Click ⚙ to open Settings.");
        return;
      }

      addMessage(currentSessionId, "user", text);
      setLoading(true);

      const wasVoice = voiceState === VoiceState.TRANSCRIBING;
      if (wasVoice) {
        setVoiceState(VoiceState.THINKING);
      }

      try {
        const data = await postChat({
          api_key: cozeApiKey,
          bot_id: botId,
          session_id: currentSessionId,
          message: text,
          mode,
          api_url: cozeApiUrl || undefined,
        });

        if (data.session_id && data.session_id !== currentSessionId) {
          setCurrentSessionId(data.session_id);
        }

        addMessage(
          data.session_id || currentSessionId,
          "assistant",
          data.text,
          data.audio_url
        );

        if (wasVoice) {
          if (data.audio_url) {
            setVoiceState(VoiceState.SPEAKING);
            const audio = new Audio(data.audio_url);
            audio.onended = () => setVoiceState(VoiceState.IDLE);
            audio.onerror = () => {
              speakWithBrowserTTS(data.text);
            };
            audio.play().catch(() => {
              speakWithBrowserTTS(data.text);
            });
          } else {
            speakWithBrowserTTS(data.text);
          }
        }
      } catch (err) {
        setError(err.message);
        if (wasVoice) {
          setVoiceState(VoiceState.ERROR);
        }
      } finally {
        setLoading(false);
      }
    },
    [
      mode,
      cozeApiKey,
      cozeApiUrl,
      debateBotId,
      discussBotId,
      currentSessionId,
      addMessage,
      voiceState,
      setVoiceState,
    ]
  );

  // Browser SpeechSynthesis fallback
  const speakWithBrowserTTS = (text) => {
    setVoiceState(VoiceState.SPEAKING);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.95;
    utterance.onend = () => setVoiceState(VoiceState.IDLE);
    utterance.onerror = () => setVoiceState(VoiceState.IDLE);
    speechSynthesis.speak(utterance);
  };

  const currentMessages = currentSessionId
    ? sessions[currentSessionId]?.messages || []
    : [];

  return (
    <div className="page-content debater-page">
      <SetupModal
        key={settingsKey}
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          setSettingsKey((k) => k + 1);
        }}
      />

      <header className="debater-header">
        <h1>
          {mode === "debate" ? "⚔ AI Debater" : "💬 AI Discuss"}
        </h1>
        <p>COZE-powered English debate & discussion</p>
      </header>

      <main className="debater-main">
        <SessionSidebar onSettingsOpen={() => setSettingsOpen(true)} />

        <div className="debater-chat">
          <div className="debater-messages">
            {currentMessages.length === 0 && !loading && (
              <div className="debater-welcome">
                <p>
                  {mode === "debate"
                    ? "Ready to debate! Type or voice your first argument."
                    : "Ready to discuss! Type or voice your first thought."}
                </p>
              </div>
            )}

            {currentMessages.map((msg, i) => {
              const isLastAI =
                msg.role === "assistant" &&
                i === currentMessages.length - 1;
              return (
                <ChatBubble
                  key={`${msg.timestamp}-${i}`}
                  message={msg}
                  isTyping={isLastAI && loading}
                  apiKey={deepseekApiKey}
                />
              );
            })}

            {loading && (
              <div className="debater-loading">
                <progress className="nes-progress is-primary" max="100"></progress>
                <p>Thinking...</p>
              </div>
            )}

            {error && (
              <div className="debater-error nes-container is-rounded">
                <p>⚠ {error}</p>
              </div>
            )}

            {/* ── Score Button (shown when there are messages) ── */}
            {currentMessages.length > 0 && !loading && (
              <div style={{ textAlign: "center", margin: "8px 0" }}>
                <button
                  className="nes-btn is-success"
                  style={{ fontSize: "0.5rem" }}
                  onClick={handleScore}
                  disabled={scoring || !deepseekApiKey}
                >
                  {scoring ? "⚙ Scoring..." : "📊 Score this Debate"}
                </button>
                {!deepseekApiKey && (
                  <p style={{ fontSize: "0.4rem", color: "#ff6b8a", marginTop: 4 }}>
                    DeepSeek API Key required for scoring. Configure in Settings ⚙
                  </p>
                )}
              </div>
            )}

            {/* ── Score Result ────────────────────────────────── */}
            {scoreResult && !scoreResult.error && (
              <div className="window" style={{ padding: "14px 18px", marginTop: 8 }}>
                <h4 style={{ fontSize: "0.55rem", color: "#50fa7b", margin: "0 0 10px", fontFamily: "'Press Start 2P', monospace" }}>
                  📊 Debate Score
                </h4>
                <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                  {[
                    { k: "grammar", label: "Grammar", max: 10 },
                    { k: "vocabulary", label: "Vocabulary", max: 10 },
                    { k: "logic", label: "Logic", max: 10 },
                    { k: "fluency", label: "Fluency", max: 10 },
                  ].map(({ k, label, max }) => (
                    <div key={k} style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: "0.4rem", color: "#7a6a9a" }}>{label}</div>
                      <div style={{ fontSize: "1rem", fontFamily: "'Press Start 2P', monospace", color: "#50fa7b" }}>
                        {scoreResult[k] ?? "-"}/{max}
                      </div>
                    </div>
                  ))}
                </div>
                {(scoreResult.suggestions || []).length > 0 && (
                  <div>
                    <p style={{ fontSize: "0.45rem", color: "#9b8ab8", marginBottom: 4 }}>💡 Suggestions:</p>
                    {scoreResult.suggestions.map((s, i) => (
                      <p key={i} style={{ fontSize: "0.45rem", color: "#6a5a8a", margin: "2px 0", paddingLeft: 8 }}>
                        • {s}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {scoreResult?.error && (
              <div className="debater-error nes-container is-rounded">
                <p>⚠ Score failed: {scoreResult.error}</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <ChatInput
            mode={mode}
            onToggleMode={(newMode) => setMode(newMode)}
            voiceMode={voiceMode}
            onToggleVoice={(enabled) => setVoiceMode(enabled)}
            onSend={handleSend}
            disabled={loading}
          />
        </div>
      </main>
    </div>
  );
}
