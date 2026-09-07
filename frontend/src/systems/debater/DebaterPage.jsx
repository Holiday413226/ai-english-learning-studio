/**
 * DebaterPage — DeepSeek/COZE-powered English debate / discussion with voice.
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
import { useState, useEffect, useRef, useCallback, useContext } from "react";
import SessionSidebar from "../../components/debater/SessionSidebar";
import ChatBubble from "../../components/debater/ChatBubble";
import ChatInput from "../../components/debater/ChatInput";
import useConfigStore from "../../store/configStore";
import useAiReady from "../../hooks/useAiReady";
import useDebaterStore, { VoiceState } from "./store";
import { SettingsContext } from "../../App";
import { postChat, getDebateScore, getSessions, getSession } from "./api";

export default function DebaterPage() {
  // ── Global config ──────────────────────────────────────────
  const cozeApiKey = useConfigStore((s) => s.cozeApiKey);
  const cozeApiUrl = useConfigStore((s) => s.cozeApiUrl);
  const debateBotId = useConfigStore((s) => s.debateBotId);
  const discussBotId = useConfigStore((s) => s.discussBotId);
  const deepseekApiKey = useConfigStore((s) => s.deepseekApiKey);
  const debateProvider = useConfigStore((s) => s.debateProvider);
  const ttsVoiceGender = useConfigStore((s) => s.ttsVoiceGender);
  const setConfig = useConfigStore((s) => s.setConfig);
  const { openSettings } = useContext(SettingsContext);
  const { hosted, deepseekReady, aiReady } = useAiReady();

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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [scoreResult, setScoreResult] = useState(null);
  const messagesEndRef = useRef(null);

  // First-launch: if no API key configured, open global settings
  useEffect(() => {
    if (!aiReady) {
      openSettings();
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
    if (!deepseekReady || !currentSessionId) return;
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
  }, [deepseekReady, deepseekApiKey, currentSessionId]);

  // ── Send message handler ─────────────────────────────────
  const handleSend = useCallback(
    async (text) => {
      setError(null);

      // Validate the provider-specific requirements before sending.
      // In hosted mode the real keys/bot IDs live on the gateway, so skip.
      if (!hosted) {
        if (debateProvider === "deepseek") {
          if (!deepseekApiKey) {
            setError("需要 DeepSeek API 密钥，点击 ⚙ 打开设置。");
            return;
          }
        } else {
          const botId = mode === "debate" ? debateBotId : discussBotId;
          if (!botId) {
            setError(
              `未配置「${mode === "debate" ? "辩论" : "讨论"}」模式的 Bot ID，点击 ⚙ 打开设置。`
            );
            return;
          }
          if (!cozeApiKey) {
            setError("需要 COZE API 密钥，点击 ⚙ 打开设置。");
            return;
          }
        }
      }

      addMessage(currentSessionId, "user", text);
      setLoading(true);

      const wasVoice = voiceState === VoiceState.TRANSCRIBING;
      if (wasVoice) {
        setVoiceState(VoiceState.THINKING);
      }

      try {
        const data = await postChat({
          provider: debateProvider,
          api_key: debateProvider === "deepseek" ? deepseekApiKey : cozeApiKey,
          bot_id:
            debateProvider === "coze"
              ? mode === "debate" ? debateBotId : discussBotId
              : "",
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
      hosted,
      debateProvider,
      deepseekApiKey,
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

  // Browser SpeechSynthesis fallback with voice gender selection
  const speakWithBrowserTTS = useCallback((text) => {
    setVoiceState(VoiceState.SPEAKING);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.95;
    utterance.onend = () => setVoiceState(VoiceState.IDLE);
    utterance.onerror = () => setVoiceState(VoiceState.IDLE);

    // Select voice by gender preference
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      const enVoices = voices.filter((v) => v.lang.startsWith("en"));
      if (ttsVoiceGender === "female") {
        const female = enVoices.find((v) =>
          v.name.includes("Zira") || v.name.includes("Susan")
          || v.name.toLowerCase().includes("female")
        );
        if (female) utterance.voice = female;
      } else {
        const male = enVoices.find((v) =>
          v.name.includes("David") || v.name.includes("Mark")
          || v.name.toLowerCase().includes("male")
        );
        if (male) utterance.voice = male;
      }
    }

    speechSynthesis.speak(utterance);
  }, [ttsVoiceGender, setVoiceState]);

  const currentMessages = currentSessionId
    ? sessions[currentSessionId]?.messages || []
    : [];

  return (
    <div className="page-content debater-page">
      <header className="debater-header">
        <h1>
          {mode === "debate" ? "AI 辩论" : "AI 讨论"}
        </h1>
        <p>
          {debateProvider === "deepseek" ? "由 DeepSeek 驱动" : "由 COZE 驱动"}{" "}
          英语辩论与讨论
        </p>
        <div className="debater-provider-toggle">
          <button
            type="button"
            className={`nes-btn ${debateProvider === "deepseek" ? "is-primary" : ""}`}
            onClick={() => setConfig({ debateProvider: "deepseek" })}
          >
            DeepSeek
          </button>
          <button
            type="button"
            className={`nes-btn ${debateProvider === "coze" ? "is-primary" : ""}`}
            onClick={() => setConfig({ debateProvider: "coze" })}
          >
            COZE
          </button>
        </div>
      </header>

      <main className="debater-main">
        <SessionSidebar />

        <div className="debater-chat">
          <div className="debater-messages">
            {currentMessages.length === 0 && !loading && (
              <div className="debater-welcome">
                <p>
                  {mode === "debate"
                    ? "准备辩论！输入或语音说出你的第一个论点。"
                    : "准备讨论！输入或语音说出你的第一个想法。"}
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
                <p>思考中…</p>
              </div>
            )}

            {error && (
              <div className="debater-error">
                <p>{error}</p>
              </div>
            )}

            {/* ── Score Button (shown when there are messages) ── */}
            {currentMessages.length > 0 && !loading && (
              <div style={{ textAlign: "center", margin: "8px 0" }}>
                <button
                  className="nes-btn is-success"
                  style={{ fontSize: "0.75rem" }}
                  onClick={handleScore}
                  disabled={scoring || !deepseekReady}
                >
                  {scoring ? "批改中…" : "批改本次辩论"}
                </button>
                {!deepseekReady && (
                  <p style={{ fontSize: "0.65rem", color: "var(--danger)", marginTop: 4 }}>
                    评分需要 DeepSeek API 密钥，请在设置中配置。
                  </p>
                )}
              </div>
            )}

            {/* ── Score Result ────────────────────────────────── */}
            {scoreResult && !scoreResult.error && (
              <div className="window" style={{ padding: "14px 18px", marginTop: 8 }}>
                <h4 style={{ fontSize: "0.8rem", color: "var(--accent)", margin: "0 0 10px", fontFamily: "var(--font-mono)" }}>
                  辩论评分
                </h4>
                <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                  {[
                    { k: "grammar", label: "语法", max: 10 },
                    { k: "vocabulary", label: "词汇", max: 10 },
                    { k: "logic", label: "逻辑", max: 10 },
                    { k: "fluency", label: "流畅度", max: 10 },
                  ].map(({ k, label, max }) => (
                    <div key={k} style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>{label}</div>
                      <div style={{ fontSize: "1rem", fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
                        {scoreResult[k] ?? "-"}/{max}
                      </div>
                    </div>
                  ))}
                </div>
                {(scoreResult.suggestions || []).length > 0 && (
                  <div>
                    <p style={{ fontSize: "0.65rem", color: "var(--text-secondary)", marginBottom: 4 }}>建议：</p>
                    {scoreResult.suggestions.map((s, i) => (
                      <p key={i} style={{ fontSize: "0.65rem", color: "var(--text-muted)", margin: "2px 0", paddingLeft: 8 }}>
                        - {s}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {scoreResult?.error && (
              <div className="debater-error">
                <p>评分失败：{scoreResult.error}</p>
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
