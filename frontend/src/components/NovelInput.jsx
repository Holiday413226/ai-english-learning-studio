import { useState, useRef } from "react";

export default function NovelInput({ novelText, setNovelText, ready, setReady }) {
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
      setNovelText(e.target.result);
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

  const charCount = novelText.length;

  return (
    <>
      <div
        className={`drop-zone ${dragOver ? "drag-over" : ""} ${novelText ? "has-file" : ""}`}
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
        {novelText ? (
          <p>
            <strong>{fileName}</strong> — {charCount.toLocaleString()} characters
          </p>
        ) : (
          <p>Drag & drop a Chinese novel .txt file here, or click to browse</p>
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
        disabled={!novelText}
        onClick={() => setReady((r) => !r)}
      >
        {ready ? "Ready — Click to unready" : "Ready"}
      </button>
    </>
  );
}