/**
 * SetupModal — global settings dialog for ALL subsystems.
 *
 * Configures:
 *   - COZE API Key (shared by Debater + Minecraft)
 *   - DeepSeek API Key (Novel translation)
 *   - Bot IDs: Debate, Discuss, Minecraft
 *   - COZE API URL (optional override)
 *
 * All values are stored in configStore (Zustand + localStorage persist).
 * Nothing is persisted on the backend — every API call sends its own keys.
 */
import { useState, useEffect } from "react";
import useConfigStore from "../store/configStore";

export default function SetupModal({ open, onClose }) {
  const config = useConfigStore();

  const [cozeApiKey, setCozeApiKey] = useState(config.cozeApiKey);
  const [cozeApiUrl, setCozeApiUrl] = useState(config.cozeApiUrl);
  const [deepseekApiKey, setDeepseekApiKey] = useState(config.deepseekApiKey);
  const [debateBotId, setDebateBotId] = useState(config.debateBotId);
  const [discussBotId, setDiscussBotId] = useState(config.discussBotId);
  const [minecraftBotId, setMinecraftBotId] = useState(config.minecraftBotId);
  const [showKey, setShowKey] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Reset local state every time the modal opens
  useEffect(() => {
    if (open) {
      setCozeApiKey(config.cozeApiKey);
      setCozeApiUrl(config.cozeApiUrl);
      setDeepseekApiKey(config.deepseekApiKey);
      setDebateBotId(config.debateBotId);
      setDiscussBotId(config.discussBotId);
      setMinecraftBotId(config.minecraftBotId);
      setSaveError(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = () => {
    setSaveError(null);
    try {
      config.setConfig({
        cozeApiKey: cozeApiKey.trim(),
        cozeApiUrl: cozeApiUrl.trim(),
        deepseekApiKey: deepseekApiKey.trim(),
        debateBotId: debateBotId.trim(),
        discussBotId: discussBotId.trim(),
        minecraftBotId: minecraftBotId.trim(),
      });
    } catch (err) {
      console.error("Failed to save settings:", err);
      setSaveError(`Save failed: ${err.message || err}`);
      return;
    }
    onClose();
  };

  if (!open) return null;

  const isFirstLaunch =
    !config.cozeApiKey &&
    !config.deepseekApiKey &&
    !config.debateBotId &&
    !config.discussBotId &&
    !config.minecraftBotId;

  return (
    <div
      className="debater-modal-overlay"
      onClick={isFirstLaunch ? undefined : onClose}
    >
      <div
        className="debater-modal nes-container is-rounded"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="debater-modal-title">⚙ Settings</h2>

        {/* ── DeepSeek (Novel) ──────────────────────────────── */}
        <fieldset className="debater-modal-fieldset">
          <legend>📖 Novel Translator (DeepSeek)</legend>
          <div className="debater-modal-field">
            <label>DeepSeek API Key</label>
            <div className="debater-modal-key-row">
              <input
                type={showKey ? "text" : "password"}
                className="nes-input"
                placeholder="sk-xxxxxxxxxxxxxxxxxxxx"
                value={deepseekApiKey}
                onChange={(e) => setDeepseekApiKey(e.target.value)}
              />
            </div>
          </div>
        </fieldset>

        {/* ── COZE (Debater + Minecraft) ────────────────────── */}
        <fieldset className="debater-modal-fieldset">
          <legend>⚔💬⛏ COZE Chat (Debater + Minecraft)</legend>
          <div className="debater-modal-field">
            <label>COZE API Key</label>
            <div className="debater-modal-key-row">
              <input
                type={showKey ? "text" : "password"}
                className="nes-input"
                placeholder="pat_xxxxxxxxxxxxxxxxxxxx"
                value={cozeApiKey}
                onChange={(e) => setCozeApiKey(e.target.value)}
              />
              <button
                type="button"
                className="nes-btn is-warning"
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          <div className="debater-modal-field">
            <label>COZE API URL</label>
            <input
              type="text"
              className="nes-input"
              placeholder="https://api.coze.cn (default)"
              value={cozeApiUrl}
              onChange={(e) => setCozeApiUrl(e.target.value)}
            />
            <small style={{ color: "#888", fontSize: "0.65rem" }}>
              Leave empty for default (api.coze.cn). Use api.coze.com for global.
            </small>
          </div>

          <div className="debater-modal-field">
            <label>Debate Bot ID</label>
            <input
              type="text"
              className="nes-input"
              placeholder="bot_xxxxxxxxxxxxxxxxxxxx"
              value={debateBotId}
              onChange={(e) => setDebateBotId(e.target.value)}
            />
          </div>

          <div className="debater-modal-field">
            <label>Discuss Bot ID</label>
            <input
              type="text"
              className="nes-input"
              placeholder="bot_xxxxxxxxxxxxxxxxxxxx"
              value={discussBotId}
              onChange={(e) => setDiscussBotId(e.target.value)}
            />
          </div>

          <div className="debater-modal-field">
            <label>Minecraft Bot ID</label>
            <input
              type="text"
              className="nes-input"
              placeholder="bot_xxxxxxxxxxxxxxxxxxxx"
              value={minecraftBotId}
              onChange={(e) => setMinecraftBotId(e.target.value)}
            />
          </div>
        </fieldset>

        {saveError && (
          <div className="debater-error nes-container is-rounded" style={{ marginBottom: "0.75rem" }}>
            <p>⚠ {saveError}</p>
          </div>
        )}

        <div className="debater-modal-actions">
          {!isFirstLaunch && (
            <button className="nes-btn" onClick={onClose}>
              Cancel
            </button>
          )}
          <button
            className="nes-btn is-primary"
            onClick={handleSave}
            disabled={
              !cozeApiKey.trim() &&
              !deepseekApiKey.trim()
            }
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
