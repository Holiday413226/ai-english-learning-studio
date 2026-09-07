/**
 * ChatBubble — renders a single message.
 * - User: right-aligned, dark green background
 * - AI:   left-aligned, dark purple background, typing effect on latest
 * - VocabStar on AI messages for saving words to Vocab Vault
 */
import TypingText from "./TypingText";
import VocabStar from "../vocab/VocabStar";

export default function ChatBubble({ message, isTyping, apiKey }) {
  const isUser = message.role === "user";

  return (
    <div className={`debater-bubble ${isUser ? "debater-bubble--user" : ""}`}>
      <div className="debater-bubble-avatar">
        {isUser ? "我" : "AI"}
      </div>
      <div
        className={`debater-bubble-content ${isUser ? "is-user" : "is-ai"}`}
      >
        {isTyping ? (
          <TypingText text={message.content} speed={25} />
        ) : (
          <>
            <p>{message.content}</p>
            {/* VocabStar on AI messages */}
            {!isUser && apiKey && (
              <div style={{ marginTop: 6, textAlign: "right" }}>
                <VocabStar
                  word={message.content?.split(/\s+/).find(w => w.length > 3) || message.content?.slice(0, 20)}
                  context={message.content?.slice(0, 200)}
                  sourceModule="debater"
                  apiKey={apiKey}
                />
              </div>
            )}
          </>
        )}
        {message.audioUrl && (
          <button
            className="nes-btn is-primary debater-audio-btn"
            onClick={() => new Audio(message.audioUrl).play()}
            title="播放语音回复"
          >
            播放
          </button>
        )}
      </div>
    </div>
  );
}