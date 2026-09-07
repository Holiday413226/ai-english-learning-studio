import { useState } from "react";

export default function ApiKeyInput({ apiKey, setApiKey }) {
  const [show, setShow] = useState(false);

  return (
    <div className="api-key-row">
      <input
        type={show ? "text" : "password"}
        className="nes-input api-key-input"
        placeholder="请输入你的 DeepSeek API 密钥…"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
      />
      <button
        type="button"
        className="nes-btn is-warning"
        onClick={() => setShow((s) => !s)}
      >
        {show ? "隐藏" : "显示"}
      </button>
    </div>
  );
}