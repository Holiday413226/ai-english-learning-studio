/**
 * VoiceButton — record button with animated waveform, language toggle,
 * phone relay QR modal, and TTS voice gender toggle.
 *
 * Uses useVoiceRecognition hook for Speech-to-Text.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import useVoiceRecognition from "../../hooks/useVoiceRecognition";
import useDebaterStore, { VoiceState } from "../../systems/debater/store";
import useConfigStore from "../../store/configStore";
import PhoneRelayModal from "./PhoneRelayModal";

export default function VoiceButton({ disabled, onResult }) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const audioContextRef = useRef(null);

  const voiceState = useDebaterStore((s) => s.voiceState);
  const setVoiceState = useDebaterStore((s) => s.setVoiceState);

  // ── TTS voice gender from global config ────────────────────
  const ttsVoiceGender = useConfigStore((s) => s.ttsVoiceGender);
  const setConfig = useConfigStore((s) => s.setConfig);

  // ── ASR language toggle ────────────────────────────────────
  const [asrLang, setAsrLang] = useState("zh-CN");

  const {
    isSupported,
    transcript,
    error: micError,
    startListening,
    stopListening,
  } = useVoiceRecognition(asrLang);

  // ── Phone relay state ──────────────────────────────────────
  const [relayOpen, setRelayOpen] = useState(false);

  // ── Waveform animation ────────────────────────────────────
  const startWaveform = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      audioContextRef.current = ctx;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const c = canvas.getContext("2d");
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        animFrameRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        c.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;
          c.fillStyle = `rgb(${80 + barHeight}, ${150 + barHeight / 2}, 123)`;
          c.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
          x += barWidth;
        }
      };
      draw();
    } catch {
      // Mic permission denied — waveform just won't show
    }
  }, []);

  const stopWaveform = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  // ── Button handler ────────────────────────────────────────
  const handleClick = async () => {
    if (voiceState === VoiceState.IDLE || voiceState === VoiceState.ERROR) {
      setVoiceState(VoiceState.RECORDING);
      await startWaveform();
      startListening();
    } else if (voiceState === VoiceState.RECORDING) {
      setVoiceState(VoiceState.TRANSCRIBING);
      stopWaveform();
      stopListening();
    }
  };

  // When transcript arrives
  useEffect(() => {
    if (transcript && voiceState === VoiceState.TRANSCRIBING) {
      onResult(transcript);
    }
  }, [transcript, voiceState, onResult]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWaveform();
    };
  }, [stopWaveform]);

  // Relay send handler
  const handleRelaySend = useCallback((text) => {
    onResult(text);
  }, [onResult]);

  if (!isSupported) {
    return (
      <div className="debater-voice-unsupported">
        <p>Voice requires Chrome browser</p>
      </div>
    );
  }

  const stateLabels = {
    [VoiceState.IDLE]: "Tap to speak",
    [VoiceState.RECORDING]: "Recording... tap to stop",
    [VoiceState.TRANSCRIBING]: "Transcribing...",
    [VoiceState.THINKING]: "AI is thinking...",
    [VoiceState.SPEAKING]: "AI is speaking...",
    [VoiceState.ERROR]: `Error: ${micError || "Retry"}`,
  };

  return (
    <div className="debater-voice-area">
      {/* ── Controls row: lang + gender + phone ─────────────── */}
      <div className="debater-voice-controls">
        <div className="debater-voice-lang">
          <button
            className={`debater-lang-btn ${asrLang === "zh-CN" ? "on" : ""}`}
            onClick={() => setAsrLang("zh-CN")}
            title="Chinese"
          >
            中
          </button>
          <button
            className={`debater-lang-btn ${asrLang === "en-US" ? "on" : ""}`}
            onClick={() => setAsrLang("en-US")}
            title="English"
          >
            EN
          </button>
        </div>

        <div className="debater-voice-gender">
          <button
            className={`debater-gender-btn ${ttsVoiceGender === "female" ? "on" : ""}`}
            onClick={() => setConfig({ ttsVoiceGender: "female" })}
            title="Female voice"
          >
            F
          </button>
          <button
            className={`debater-gender-btn ${ttsVoiceGender === "male" ? "on" : ""}`}
            onClick={() => setConfig({ ttsVoiceGender: "male" })}
            title="Male voice"
          >
            M
          </button>
        </div>

        <button
          className="debater-phone-btn nes-btn is-primary"
          onClick={() => setRelayOpen(true)}
          title="Phone voice input"
          style={{ fontSize: "0.65rem", padding: "2px 8px" }}
        >
          Phone
        </button>
      </div>

      {/* ── Waveform ──────────────────────────────────────────── */}
      <canvas
        ref={canvasRef}
        className={`debater-waveform ${
          voiceState === VoiceState.RECORDING ? "active" : ""
        }`}
        width={300}
        height={50}
      />

      {/* ── Record button + status ────────────────────────────── */}
      <button
        className={`nes-btn debater-voice-btn ${
          voiceState === VoiceState.RECORDING ? "is-error" : "is-primary"
        }`}
        onClick={handleClick}
        disabled={
          disabled ||
          voiceState === VoiceState.TRANSCRIBING ||
          voiceState === VoiceState.THINKING ||
          voiceState === VoiceState.SPEAKING
        }
      >
        {voiceState === VoiceState.RECORDING ? "Stop" : "Record"}
      </button>
      <span className="debater-voice-status">
        {stateLabels[voiceState]}
      </span>

      {/* ── Shared Phone Relay Modal ──────────────────────────── */}
      <PhoneRelayModal
        open={relayOpen}
        onClose={() => setRelayOpen(false)}
        onSend={handleRelaySend}
      />
    </div>
  );
}
