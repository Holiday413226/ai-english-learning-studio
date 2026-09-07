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
import { useState, useEffect, useRef } from "react";
import useConfigStore from "../store/configStore";

const KEY_MAP = {
  deepseekApiKey: "deepseek_api_key",
  cozeApiKey: "coze_api_key",
  debateBotId: "debate_bot_id",
  discussBotId: "discuss_bot_id",
  minecraftBotId: "minecraft_bot_id",
  aiMode: "ai_mode",
  gatewayUrl: "gateway_url",
  activationCode: "activation_code",
};

export default function SetupModal({ open, onClose, onGlitchTrigger }) {
  const config = useConfigStore();

  const [cozeApiKey, setCozeApiKey] = useState(config.cozeApiKey);
  const [cozeApiUrl, setCozeApiUrl] = useState(config.cozeApiUrl);
  const [deepseekApiKey, setDeepseekApiKey] = useState(config.deepseekApiKey);
  const [debateBotId, setDebateBotId] = useState(config.debateBotId);
  const [discussBotId, setDiscussBotId] = useState(config.discussBotId);
  const [minecraftBotId, setMinecraftBotId] = useState(config.minecraftBotId);
  const [aiMode, setAiMode] = useState(config.aiMode);
  const [gatewayUrl, setGatewayUrl] = useState(config.gatewayUrl);
  const [activationCode, setActivationCode] = useState(config.activationCode);
  const [ttsVoiceGender, setTtsVoiceGender] = useState(config.ttsVoiceGender);
  const [showKey, setShowKey] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [keyStatus, setKeyStatus] = useState({});  // backend keyring status

  const cageRef = useRef(null);
  const rafRef = useRef(null);
  const angleRef = useRef(0);
  const hoverTargetRef = useRef(null);
  const hoverStartAngleRef = useRef(0);
  const hoverStartTimeRef = useRef(0);
  const lastTimeRef = useRef(0);

  const NORMAL_SPEED = 18;        // 360° / 20s = 18°/s
  const HOVER_DURATION = 0.55;    // target time to complete remaining rotation (seconds)

  // Fetch backend keyring status on mount + when modal opens
  useEffect(() => {
    fetch("/api/config/status")
      .then((r) => r.json())
      .then((s) => setKeyStatus(s))
      .catch(() => setKeyStatus({}));
  }, [open]);

  // Reset local state every time the modal opens (from the live store)
  useEffect(() => {
    if (open) {
      setCozeApiKey(config.cozeApiKey);
      setCozeApiUrl(config.cozeApiUrl);
      setDeepseekApiKey(config.deepseekApiKey);
      setDebateBotId(config.debateBotId);
      setDiscussBotId(config.discussBotId);
      setMinecraftBotId(config.minecraftBotId);
      setAiMode(config.aiMode);
      setGatewayUrl(config.gatewayUrl);
      setActivationCode(config.activationCode);
      setTtsVoiceGender(config.ttsVoiceGender);
      setSaveError(null);
      setVerifyResult(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 3D Cage rotation via requestAnimationFrame ──────────
  useEffect(() => {
    if (!open) return;

    const cage = cageRef.current;
    if (!cage) return;

    lastTimeRef.current = performance.now();

    function tick(now) {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;

      let angle = angleRef.current;

      if (hoverTargetRef.current !== null) {
        const elapsed = (now - hoverStartTimeRef.current) / 1000;
        const remaining = hoverTargetRef.current - angle;
        if (remaining <= 0.5) {
          angle = hoverTargetRef.current;
        } else {
          let speed = remaining / Math.max(HOVER_DURATION - elapsed, 0.05);
          speed = Math.max(speed, NORMAL_SPEED * 2);
          angle += speed * dt;
          if (angle >= hoverTargetRef.current) angle = hoverTargetRef.current;
        }
      } else {
        angle += NORMAL_SPEED * dt;
      }

      angleRef.current = angle;

      const xTilt = Math.sin(angle * Math.PI / 180) * 4;
      cage.style.transform = 'rotateY(' + angle + 'deg) rotateX(' + xTilt + 'deg)';

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    const handleEnter = () => {
      const a = angleRef.current;
      hoverStartAngleRef.current = a;
      let target = Math.ceil(a / 360) * 360;
      if (target <= a) target += 360;
      hoverTargetRef.current = target;
      hoverStartTimeRef.current = performance.now();
    };

    const handleLeave = () => {
      hoverTargetRef.current = null;
    };

    cage.addEventListener('mouseenter', handleEnter);
    cage.addEventListener('mouseleave', handleLeave);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      cage.removeEventListener('mouseenter', handleEnter);
      cage.removeEventListener('mouseleave', handleLeave);
    };
  }, [open]);

  const handleClose = () => {
    onClose();
    if (onGlitchTrigger) {
      setTimeout(() => onGlitchTrigger(), 50);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    const base = gatewayUrl.trim().replace(/\/+$/, "");
    try {
      const health = await fetch(`${base}/v1/health`);
      if (!health.ok) {
        setVerifyResult({ ok: false, msg: "无法连接服务器，请检查地址" });
        return;
      }
      const resp = await fetch(`${base}/v1/ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activationCode.trim()}`,
        },
        body: JSON.stringify({ op: "novel_define", params: { word: "hello", context: "" } }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.ok) {
        setVerifyResult({ ok: true, msg: "激活成功，可以开始使用" });
      } else {
        setVerifyResult({ ok: false, msg: data.error || `验证失败（HTTP ${resp.status}）` });
      }
    } catch (err) {
      setVerifyResult({ ok: false, msg: `连接失败：${err.message}` });
    } finally {
      setVerifying(false);
    }
  };

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
        aiMode,
        gatewayUrl: gatewayUrl.trim(),
        activationCode: activationCode.trim(),
        ttsVoiceGender,
      });

      // 2. Save to backend keyring_store for EXE restart survival.
      //    Empty values are posted too so the backend can clear the key.
      const entries = [
        { k: "deepseek_api_key", v: deepseekApiKey },
        { k: "coze_api_key", v: cozeApiKey },
        { k: "debate_bot_id", v: debateBotId },
        { k: "discuss_bot_id", v: discussBotId },
        { k: "minecraft_bot_id", v: minecraftBotId },
        { k: "ai_mode", v: aiMode },
        { k: "gateway_url", v: gatewayUrl },
        { k: "activation_code", v: activationCode },
      ];
      for (const { k, v } of entries) {
        const res = await fetch("/api/config/set", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: k, value: v.trim() }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `保存失败 ${k} (HTTP ${res.status})`);
        }
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
      setSaveError(`保存失败：${err.message || err}`);
      return;
    }
    if (onGlitchTrigger) {
      setTimeout(() => onGlitchTrigger(), 50);
    }
    onClose();
  };

  if (!open) return null;

  const isFirstLaunch =
    !config.cozeApiKey &&
    !config.deepseekApiKey &&
    !config.debateBotId &&
    !config.discussBotId &&
    !config.minecraftBotId &&
    !config.gatewayUrl &&
    !config.activationCode;

  return (
    <div
      className="debater-modal-overlay"
      onClick={isFirstLaunch ? undefined : handleClose}
    >
      <div className="modal-cage" ref={cageRef}>
        <div className="cage-ring flower-a"></div>
        <div className="cage-ring flower-a"></div>
        <div className="cage-ring flower-a"></div>
        <div className="cage-ring flower-a"></div>
        <div className="cage-ring flower-a"></div>
        <div className="cage-ring flower-a"></div>
        <div className="cage-ring flower-b"></div>
        <div className="cage-ring flower-b"></div>
        <div className="cage-ring flower-b"></div>
        <div className="cage-ring flower-b"></div>
        <div className="cage-ring flower-b"></div>
        <div className="cage-ring flower-b"></div>
        <div
          className="debater-modal-setup"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Navi Wireframe Globe */}
          <div className="globe-container">
            <div className="globe">
              <div className="ring ring-y"></div>
              <div className="ring ring-y"></div>
              <div className="ring ring-y"></div>
              <div className="ring ring-y"></div>
              <div className="ring ring-y"></div>
              <div className="ring ring-y"></div>
              <div className="ring ring-x"></div>
              <div className="ring ring-x"></div>
              <div className="ring ring-x"></div>
              <div className="ring ring-x"></div>
              <div className="ring ring-x"></div>
              <div className="ring ring-x"></div>
              <div className="ring ring-d"></div>
              <div className="ring ring-d"></div>
              <span className="pixel-dot"></span>
              <span className="pixel-dot"></span>
              <span className="pixel-dot"></span>
              <span className="pixel-dot"></span>
              <span className="pixel-dot"></span>
            </div>
          </div>

          <h2 className="debater-modal-title">设置</h2>

          {/* ── Mode switch: hosted (activation code) vs byok ─── */}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 14 }}>
            <button
              type="button"
              className={`nes-btn ${aiMode === "hosted" ? "is-primary" : ""}`}
              style={{ fontSize: "0.7rem" }}
              onClick={() => { setAiMode("hosted"); setVerifyResult(null); }}
            >
              激活码（推荐）
            </button>
            <button
              type="button"
              className={`nes-btn ${aiMode === "byok" ? "is-primary" : ""}`}
              style={{ fontSize: "0.7rem" }}
              onClick={() => { setAiMode("byok"); setVerifyResult(null); }}
            >
              自备 Key（高级）
            </button>
          </div>

          {aiMode === "hosted" ? (
            <fieldset className="debater-modal-fieldset">
              <legend>激活码（托管服务）</legend>
              <div className="debater-modal-field">
                <label>服务器地址</label>
                <input
                  type="text"
                  className="nes-input"
                  placeholder="https://your-gateway.example.com"
                  value={gatewayUrl}
                  onChange={(e) => setGatewayUrl(e.target.value)}
                />
                <small style={{ color: "#888", fontSize: "0.6rem" }}>
                  由发行方提供，通常无需修改。
                </small>
              </div>
              <div className="debater-modal-field">
                <label>激活码</label>
                <input
                  type="text"
                  className="nes-input"
                  placeholder="AIES-XXXX-XXXX-XXXX-XXXX"
                  value={activationCode}
                  onChange={(e) => setActivationCode(e.target.value)}
                />
              </div>
              <div className="debater-modal-field">
                <button
                  type="button"
                  className="nes-btn is-success"
                  style={{ fontSize: "0.7rem" }}
                  onClick={handleVerify}
                  disabled={verifying || !gatewayUrl.trim() || !activationCode.trim()}
                >
                  {verifying ? "验证中…" : "验证激活码"}
                </button>
                {verifyResult && (
                  <small
                    style={{
                      color: verifyResult.ok ? "var(--accent)" : "var(--danger)",
                      fontSize: "0.6rem",
                      display: "block",
                      marginTop: 6,
                    }}
                  >
                    {verifyResult.msg}
                  </small>
                )}
              </div>
            </fieldset>
          ) : (
          <div className="setup-modal-columns">

            {/* ── Left: DeepSeek (Novel) ───────────────────────── */}
            <fieldset className="debater-modal-fieldset">
              <legend>小说翻译（DeepSeek）</legend>
              <div className="debater-modal-field">
                <label>DeepSeek API 密钥</label>
                <input
                  type={showKey ? "text" : "password"}
                  className="nes-input"
                  placeholder="sk-xxxxxxxxxxxxxxxxxxxx"
                  value={deepseekApiKey}
                  onChange={(e) => setDeepseekApiKey(e.target.value)}
                />
              </div>
            </fieldset>

            {/* ── Right: COZE (Debater + Minecraft) ────────────── */}
            <fieldset className="debater-modal-fieldset">
              <legend>COZE 对话（辩论 + 我的世界）</legend>
              <div className="debater-modal-field">
                <label>COZE API 密钥</label>
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
                    style={{ padding: "0 8px" }}
                  >
                    {showKey ? "隐藏" : "显示"}
                  </button>
                </div>
              </div>

              <div className="debater-modal-field">
                <label>COZE API 地址</label>
                <input
                  type="text"
                  className="nes-input"
                  placeholder="https://api.coze.cn （默认）"
                  value={cozeApiUrl}
                  onChange={(e) => setCozeApiUrl(e.target.value)}
                />
                <small style={{ color: "#888", fontSize: "0.6rem" }}>
                  留空则使用默认地址（api.coze.cn）；海外用户请用 api.coze.com。
                </small>
              </div>

              <div className="debater-modal-field">
                <label>辩论 Bot ID</label>
                <input
                  type="text"
                  className="nes-input"
                  placeholder="bot_xxxxxxxxxxxxxxxxxxxx"
                  value={debateBotId}
                  onChange={(e) => setDebateBotId(e.target.value)}
                />
              </div>

              <div className="debater-modal-field">
                <label>讨论 Bot ID</label>
                <input
                  type="text"
                  className="nes-input"
                  placeholder="bot_xxxxxxxxxxxxxxxxxxxx"
                  value={discussBotId}
                  onChange={(e) => setDiscussBotId(e.target.value)}
                />
              </div>

              <div className="debater-modal-field">
                <label>我的世界 Bot ID</label>
                <input
                  type="text"
                  className="nes-input"
                  placeholder="bot_xxxxxxxxxxxxxxxxxxxx"
                  value={minecraftBotId}
                  onChange={(e) => setMinecraftBotId(e.target.value)}
                />
              </div>
            </fieldset>
          </div>
          )}

          {/* ── Voice Preferences ──────────────────────────────── */}
          <fieldset className="debater-modal-fieldset setup-modal-voice">
            <legend>AI 语音输出</legend>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <label style={{ fontSize: "0.7rem", color: "var(--text-primary)" }}>TTS 音色：</label>
              <button
                type="button"
                className={`nes-btn ${ttsVoiceGender === "female" ? "is-primary" : ""}`}
                style={{ fontSize: "0.65rem" }}
                onClick={() => setTtsVoiceGender("female")}
              >
                女声
              </button>
              <button
                type="button"
                className={`nes-btn ${ttsVoiceGender === "male" ? "is-primary" : ""}`}
                style={{ fontSize: "0.65rem" }}
                onClick={() => setTtsVoiceGender("male")}
              >
                男声
              </button>
            </div>
            <small style={{ color: "#888", fontSize: "0.6rem", display: "block", marginTop: 6 }}>
              仅用于浏览器 TTS 兜底；COZE 音频使用机器人自带音色。
            </small>
          </fieldset>

          {saveError && (
            <div className="debater-error" style={{ marginBottom: "0.75rem" }}>
              <p>{saveError}</p>
            </div>
          )}

          <div className="debater-modal-actions">
            {!isFirstLaunch && (
              <button className="nes-btn" onClick={handleClose}>
                取消
              </button>
            )}
            <button
              className="nes-btn is-primary"
              onClick={handleSave}
              disabled={
                aiMode === "hosted"
                  ? !gatewayUrl.trim() || !activationCode.trim()
                  : !cozeApiKey.trim() && !deepseekApiKey.trim()
              }
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}