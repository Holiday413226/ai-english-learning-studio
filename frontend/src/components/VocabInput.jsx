import { useState, useRef } from "react";

export default function VocabInput({ vocabText, setVocabText, ready, setReady }) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef(null);

  const handleFile = (file) => {
    if (!file.name.endsWith(".txt")) {
      alert("请上传 .txt 文件（UTF-8 编码）");
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
      <h3 className="window-title">第 2 步 — 上传四六级词汇表（.txt）</h3>
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
            <strong>{fileName}</strong> — {vocabCount} 个单词
          </p>
        ) : (
          <p>将词汇表 .txt 文件拖到这里，或点击浏览选择</p>
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
        {ready ? "已就绪 — 点击取消就绪" : "就绪"}
      </button>
    </>
  );
}