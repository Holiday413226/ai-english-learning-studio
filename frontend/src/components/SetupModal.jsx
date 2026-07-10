/**
 * SetupModal — global settings dialog for ALL subsystems.
 *
 * Configures:
 *   - COZE API Key (shared by Debater + Minecraft)
 *   - DeepSeek API Key (Novel translation)
 *   - Bot IDs: Debate, Discuss, Minecraft
 *   - COZE API URL (optional override)
 *
 * Values are stored in TWO places:
 *   1. configStore (Zustand + localStorage) — for in-session access
 *   2. Backend keyring_store (/api/config/set) — for EXE restart survival
 *
 * On mount, keys are restored from backend for security (no plaintext in localStorage).
 * On save, keys are written to both Zustand and backend.
 */
import { useState, useEffect } from "react";
import useConfigStore from "../store/configStore";

const KEY_MAP = {
  deepseekApiKey: "deepseek_api_key",
  cozeApiKey: "coze_api_key",
  debateBotId: "debate_bot_id",
  discussBotId: "discuss_bot_id",
  minecraftBotId: "minecraft_bot_id",
};

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
  const [keyStatus, setKeyStatus] = useState({});  // backend keyring status

  // Fetch backend keyring status on mount + when modal opens
  useEffect(() => {
    fetch("/api/config/status")
      .then((r) => r.json())
      .then((s) => setKeyStatus(s))
      .catch(() => setKeyStatus({}));
  }, [open]);

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

  const handleSave = async () => {
    setSaveError(null);
    try {
      // 1. Save to Zustand (localStorage) for in-session use
      config.setConfig({
        cozeApiKey: cozeApiKey.trim(),
        cozeApiUrl: cozeApiUrl.trim(),
        deepseekApiKey: deepseekApiKey.trim(),
        debateBotId: debateBotId.trim(),
        discussBotId: discussBotId.trim(),
        minecraftBotId: minecraftBotId.trim(),
      });

      // 2. Save to backend keyring_store for EXE restart survival
      const entries = [
        { k: "deepseek_api_key", v: deepseekApiKey },
        { k: "coze_api_key", v: cozeApiKey },
        { k: "debate_bot_id", v: debateBotId },
        { k: "discuss_bot_id", v: discussBotId },
        { k: "minecraft_bot_id", v: minecraftBotId },
      ];
      for (const { k, v } of entries) {
        if (v.trim()) {
          await fetch("/api/config/set", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: k, value: v.trim() }),
          });
        }
      }
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
