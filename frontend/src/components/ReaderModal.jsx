export default function ReaderModal({ htmlContent, highlightCount, onClose }) {
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="reader-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="全屏阅读器"
    >
      <div className="reader-container">
        <div className="reader-header">
          <h2>全屏阅读器</h2>
          <span className="reader-stats">
            已高亮 {highlightCount} 个词汇
          </span>
          <button
            type="button"
            className="nes-btn is-error reader-close"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
        <div className="reader-body">
          <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
        </div>
      </div>
    </div>
  );
}