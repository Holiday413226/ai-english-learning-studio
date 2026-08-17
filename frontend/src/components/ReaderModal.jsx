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
      aria-label="Full-screen reader"
    >
      <div className="reader-container">
        <div className="reader-header">
          <h2>Full-Screen Reader</h2>
          <span className="reader-stats">
            {highlightCount} vocab words highlighted
          </span>
          <button
            type="button"
            className="nes-btn is-error reader-close"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="reader-body">
          <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
        </div>
      </div>
    </div>
  );
}