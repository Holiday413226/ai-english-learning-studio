/**
 * PhoneRelayModal — standalone QR-code phone voice relay dialog.
 *
 * Used by ChatInput (always-visible 📱 button) and by VoiceButton (📱 in voice area).
 * Opens a QR code → phone scans → speaks → text arrives via polling.
 */
import { useState, useEffect, useRef, useCallback } from "react";

const QR_API = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=";

export default function PhoneRelayModal({ open, onClose, onSend }) {
  const [relayUrl, setRelayUrl] = useState("");
  const [relayStatus, setRelayStatus] = useState("idle"); // idle | waiting | received
  const [relayText, setRelayText] = useState("");
  const [relaySince, setRelaySince] = useState(0);
  const pollTimerRef = useRef(null);

  // Fetch relay URL on mount
  useEffect(() => {
    fetch("/api/relay/info")
      .then((r) => r.json())
      .then((d) => { if (d.url) setRelayUrl(d.url); })
      .catch(() => {});
  }, []);

  // Start polling when modal opens
  useEffect(() => {
    if (!open) {
      setRelayStatus("idle");
      setRelayText("");
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    setRelaySince(Date.now() / 1000);
    setRelayStatus("waiting");
    setRelayText("");

    pollTimerRef.current = setInterval(() => {
      fetch(`/api/relay/receive?since=${relaySince}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.text) {
            setRelayText(data.text);
            setRelayStatus("received");
          }
        })
        .catch(() => {});
    }, 1000);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [open]);

  // Send relayed text
  const handleSend = useCallback(() => {
    if (relayText) {
      onSend(relayText);
      onClose();
    }
  }, [relayText, onSend, onClose]);

  if (!open) return null;

  return (
    <div className="relay-modal-overlay" onClick={onClose}>
      <div className="relay-modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: "0.8rem", margin: "0 0 12px", color: "var(--text-primary)" }}>Phone Voice Input</h3>

        {relayUrl ? (
          <>
            <img
              src={`${QR_API}${encodeURIComponent(relayUrl)}`}
              alt="QR Code"
              style={{ width: 180, height: 180, display: "block", margin: "0 auto 8px" }}
            />
            <p style={{ fontSize: "0.65rem", color: "var(--text-secondary)", textAlign: "center", wordBreak: "break-all", margin: "0 0 12px" }}>
              {relayUrl}
            </p>
          </>
        ) : (
          <p style={{ fontSize: "0.7rem", color: "var(--danger)", textAlign: "center" }}>
            Backend not reachable. Make sure the server is running.
          </p>
        )}

        <div style={{ textAlign: "center", marginBottom: 12 }}>
          {relayStatus === "waiting" && (
            <span style={{ fontSize: "0.7rem", color: "var(--accent)" }}>Waiting for input...</span>
          )}
          {relayStatus === "received" && (
            <div>
              <span style={{ fontSize: "0.7rem", color: "var(--accent)" }}>Received:</span>
              <p style={{ fontSize: "0.75rem", color: "var(--text-primary)", margin: "8px 0", padding: "8px", background: "var(--bg-input)", borderRadius: 6 }}>
                {relayText}
              </p>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          {relayStatus === "received" && (
            <button className="nes-btn is-success" style={{ fontSize: "0.7rem" }} onClick={handleSend}>
              Send
            </button>
          )}
          <button className="nes-btn" style={{ fontSize: "0.7rem" }} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
