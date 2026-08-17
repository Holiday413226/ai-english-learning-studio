import { useState } from "react";

export default function ApiKeyInput({ apiKey, setApiKey }) {
  const [show, setShow] = useState(false);

  return (
    <div className="api-key-row">
      <input
        type={show ? "text" : "password"}
        className="nes-input api-key-input"
        placeholder="Enter your DeepSeek API Key..."
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
      />
      <button
        type="button"
        className="nes-btn is-warning"
        onClick={() => setShow((s) => !s)}
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}