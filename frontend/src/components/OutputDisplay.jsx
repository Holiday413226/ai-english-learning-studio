import { useState } from "react";
import { applyHighlights } from "../highlight";
import ReaderModal from "./ReaderModal";

export default function OutputDisplay({ result, loading, error }) {
  const [modalOpen, setModalOpen] = useState(false);

  if (loading) {
    return (
      <>
        <h3 className="window-title">翻译结果</h3>
        <div className="loading-box">
          <p>AI 正在翻译你的小说…请稍候</p>
          <progress className="nes-progress is-primary" max="100"></progress>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <h3 className="window-title">翻译结果</h3>
        <div className="error-box">
          <p>{error}</p>
        </div>
      </>
    );
  }

  if (!result) {
    return (
      <>
        <h3 className="window-title">翻译结果</h3>
        <div className="placeholder-box">
          <p>两个「就绪」按钮都按下后，译文将显示在这里…</p>
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
      <h3 className="window-title">翻译结果</h3>

      <div
        className="output-area"
        onClick={() => setModalOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") setModalOpen(true);
        }}
        title="点击打开全屏阅读器"
      >
        <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
      </div>

      <div className="output-actions">
        <span className="highlight-count">
          {result.highlights.length} 个四六级词汇已高亮
        </span>
        <button
          type="button"
          className="nes-btn is-primary block-btn"
          onClick={handleDownload}
        >
          下载译文 TXT
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