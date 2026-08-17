import { useState, useRef } from "react";

export default function VocabInput({ vocabText, setVocabText, ready, setReady }) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef(null);

  const handleFile = (file) => {
    if (!file.name.endsWith(".txt")) {
      alert("Please upload a .txt file (UTF-8 encoded)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setVocabText(e.target.result);
      setFileName(file.name);
      setReady(false);
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const vocabCount = vocabText
    .split("\n")
    .map((w) => w.trim())
    .filter(Boolean).length;

  return (
    <>
      <h3 className="window-title">Step 2 — Upload CET-4/6 Vocabulary (.txt)</h3>
      <div
        className={`drop-zone ${dragOver ? "drag-over" : ""} ${vocabText ? "has-file" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") fileInputRef.current?.click();
        }}
      >
        {vocabText ? (
          <p>
            <strong>{fileName}</strong> — {vocabCount} vocabulary words
          </p>
        ) : (
          <p>Drag & drop a vocabulary .txt file here, or click to browse</p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files[0]) handleFile(e.target.files[0]);
          }}
        />
      </div>
      <button
        type="button"
        className={`nes-btn block-btn ${ready ? "is-success" : "is-primary"}`}
        disabled={!vocabText}
        onClick={() => setReady((r) => !r)}
      >
        {ready ? "Ready — Click to unready" : "Ready"}
      </button>
    </>
  );
}