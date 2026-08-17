import { useState } from "react";
import { applyHighlights } from "../highlight";
import ReaderModal from "./ReaderModal";

export default function OutputDisplay({ result, loading, error }) {
  const [modalOpen, setModalOpen] = useState(false);

  if (loading) {
    return (
      <>
        <h3 className="window-title">Translation Output</h3>
        <div className="loading-box">
          <p>AI is translating your novel... please wait</p>
          <progress className="nes-progress is-primary" max="100"></progress>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <h3 className="window-title">Translation Output</h3>
        <div className="error-box">
          <p>{error}</p>
        </div>
      </>
    );
  }

  if (!result) {
    return (
      <>
        <h3 className="window-title">Translation Output</h3>
        <div className="placeholder-box">
          <p>Translated text will appear here after you press both Ready buttons...</p>
        </div>
      </>
    );
  }

  const htmlContent = applyHighlights(result.translated_text, result.highlights);

  const handleDownload = () => {
    const blob = new Blob([result.translated_text], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "translated_novel.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <h3 className="window-title">Translation Output</h3>

      <div
        className="output-area"
        onClick={() => setModalOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") setModalOpen(true);
        }}
        title="Click to open full-screen reader"
      >
        <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
      </div>

      <div className="output-actions">
        <span className="highlight-count">
          {result.highlights.length} CET-4/6 vocabulary words highlighted
        </span>
        <button
          type="button"
          className="nes-btn is-primary block-btn"
          onClick={handleDownload}
        >
          Download Translated TXT
        </button>
      </div>

      {modalOpen && (
        <ReaderModal
          htmlContent={htmlContent}
          highlightCount={result.highlights.length}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}