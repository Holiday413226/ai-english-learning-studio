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
import { postChat } from "./api";

export default function DebaterPage() {
  // ── Global config ──────────────────────────────────────────
  const cozeApiKey = useConfigStore((s) => s.cozeApiKey);
  const cozeApiUrl = useConfigStore((s) => s.cozeApiUrl);
  const debateBotId = useConfigStore((s) => s.debateBotId);
  const discussBotId = useConfigStore((s) => s.discussBotId);

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
  const messagesEndRef = useRef(null);

  // First-launch: if no COZE API key, force settings modal
  useEffect(() => {
    if (!cozeApiKey && !debateBotId && !discussBotId) {
      setSettingsOpen(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ensure a session exists on mount
  useEffect(() => {
    const ids = Object.keys(sessions);
    if (ids.length === 0) {
      createSession();
    } else if (!currentSessionId || !sessions[currentSessionId]) {
      const latest = ids.sort(
        (a, b) => sessions[b].updatedAt - sessions[a].updatedAt
      )[0];
      setCurrentSessionId(latest);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessions, currentSessionId]);

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
