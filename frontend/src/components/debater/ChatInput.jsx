/**
 * ChatInput — bottom bar with:
 * - Mode toggle (Debate / Discuss)
 * - Voice toggle (Text / Voice)
 * - Phone relay button (always visible)
 * - Text input or VoiceButton
 * - Send button
 */
import { useState, useRef } from "react";
import VoiceButton from "./VoiceButton";
import PhoneRelayModal from "./PhoneRelayModal";

export default function ChatInput({
  mode,
  onToggleMode,
  voiceMode,
  onToggleVoice,
  onSend,
  disabled,
}) {
  const [text, setText] = useState("");
  const [relayOpen, setRelayOpen] = useState(false);
  const inputRef = useRef(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    inputRef.current?.focus();
  };

  const handleVoiceResult = (transcript) => {
    onSend(transcript);
  };

  const handleRelaySend = (transcript) => {
    onSend(transcript);
  };

  const placeholder =
    mode === "debate"
      ? "陈述你的论点…"
      : "分享你的想法…";

  return (
    <div className="debater-input-bar">
      {/* Row 1: toggles + phone relay button */}
      <div className="debater-toggles">
        <label className="debater-toggle">
          <span>辩论</span>
          <input
            type="checkbox"
            className="nes-toggle"
            checked={mode === "discuss"}
            onChange={(e) =>
              onToggleMode(e.target.checked ? "discuss" : "debate")
            }
          />
          <span>讨论</span>
        </label>

        <label className="debater-toggle">
          <span>文字</span>
          <input
            type="checkbox"
            className="nes-toggle"
            checked={voiceMode}
            onChange={(e) => onToggleVoice(e.target.checked)}
          />
          <span>语音</span>
        </label>

        <button
          className="nes-btn is-primary"
          onClick={() => setRelayOpen(true)}
          title="手机语音输入"
          style={{ fontSize: "0.55rem", padding: "3px 10px", flexShrink: 0 }}
        >
          手机输入
        </button>
      </div>

      {/* Row 2: input area */}
      <div className="debater-input-row">
        {voiceMode ? (
          <VoiceButton disabled={disabled} onResult={handleVoiceResult} />
        ) : (
          <>
            <input
              ref={inputRef}
              type="text"
              className="nes-input debater-text-input"
              placeholder={placeholder}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={disabled}
            />
            <button
              className="nes-btn is-primary debater-send-btn"
              onClick={handleSend}
              disabled={disabled || !text.trim()}
            >
              发送
            </button>
          </>
        )}
      </div>

      {/* ── Shared Phone Relay Modal ──────────────────────────── */}
      <PhoneRelayModal
        open={relayOpen}
        onClose={() => setRelayOpen(false)}
        onSend={handleRelaySend}
      />
    </div>
  );
}