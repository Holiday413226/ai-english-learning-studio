/**
 * SessionSidebar — left panel displaying past chat sessions.
 */
import { useContext } from "react";
import useDebaterStore from "../../systems/debater/store";
import { SettingsContext } from "../../App";

export default function SessionSidebar({}) {
  const { openSettings } = useContext(SettingsContext);
  const {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    createSession,
    deleteSession,
  } = useDebaterStore();

  const handleNewChat = () => {
    createSession();
  };

  const sortedSessions = Object.entries(sessions).sort(
    (a, b) => b[1].updatedAt - a[1].updatedAt
  );

  return (
    <div className="debater-sessions">
      <div className="debater-sessions-header">
        <button
          className="nes-btn is-primary debater-new-chat-btn"
          onClick={handleNewChat}
        >
          + New Chat
        </button>
        <button
          className="nes-btn is-warning debater-settings-btn"
          onClick={openSettings}
          title="Settings"
        >
          Settings
        </button>
      </div>

      <div className="debater-sessions-list">
        {sortedSessions.map(([id, session]) => {
          const preview =
            session.messages
              .filter((m) => m.role === "user")
              .slice(-1)[0]
              ?.content?.slice(0, 40) || "New Chat";

          return (
            <div
              key={id}
              className={`debater-session-item ${
                id === currentSessionId ? "active" : ""
              }`}
              onClick={() => setCurrentSessionId(id)}
            >
              <span className="debater-session-mode">
                {session.mode === "debate" ? "D" : "C"}
              </span>
              <span className="debater-session-preview">{preview}</span>
              <button
                className="debater-session-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm("Delete this chat session?")) {
                    deleteSession(id);
                  }
                }}
                title="Delete session"
              >
                x
              </button>
            </div>
          );
        })}

        {sortedSessions.length === 0 && (
          <p className="debater-sessions-empty">
            No chats yet. Start a new one!
          </p>
        )}
      </div>
    </div>
  );
}