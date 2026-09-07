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
          + 新对话
        </button>
        <button
          className="nes-btn is-warning debater-settings-btn"
          onClick={openSettings}
          title="设置"
        >
          设置
        </button>
      </div>

      <div className="debater-sessions-list">
        {sortedSessions.map(([id, session]) => {
          const preview =
            session.messages
              .filter((m) => m.role === "user")
              .slice(-1)[0]
              ?.content?.slice(0, 40) || "新对话";

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
                  if (window.confirm("确定删除这段对话吗？")) {
                    deleteSession(id);
                  }
                }}
                title="删除对话"
              >
                x
              </button>
            </div>
          );
        })}

        {sortedSessions.length === 0 && (
          <p className="debater-sessions-empty">
            还没有对话，开始一个新对话吧！
          </p>
        )}
      </div>
    </div>
  );
}