import { useEffect, useId, useRef } from 'react';
import { usePlayExportController } from './usePlayExportController';

export default function PlayExportControls({
  playRef,
  gameId,
  gameStatus,
  box,
  exportData,
  onExportInteractionStart,
}) {
  const exportPreviewRef = useRef(null);
  const captionTextareaId = useId();
  const hasDisplayData = exportData.hasDisplayData;
  const isOvertimeGame = Number(exportData?.numPeriods) > 4;

  const {
    isExporting,
    exportPreview,
    exportError,
    exportView,
    exportPlayerKey,
    exportViewOptions,
    exportPlayerOptions,
    resolvedExportRange,
    exportRangeOptions,
    filteredRangeEndOptions,
    previewIsUpdating,
    captionText,
    captionMaxLength,
    captionCanApply,
    exportDisabled,
    setExportView,
    setExportPlayerKey,
    handleExportRangeStartChange,
    handleExportRangeEndChange,
    handleExportImage,
    handleSharePreview,
    handleDownloadPreview,
    closeExportPreview,
    clearExportError,
    handleCaptionChange,
    handleApplyCaption,
    handleClearCaption,
  } = usePlayExportController({
    playRef,
    gameId,
    gameStatus,
    box,
    exportData,
    onExportInteractionStart,
  });

  useEffect(() => {
    if (!exportPreview) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeExportPreview();
      }
    };
    const handlePointerDown = (event) => {
      if (!exportPreviewRef.current) return;
      if (!exportPreviewRef.current.contains(event.target)) {
        closeExportPreview();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [exportPreview, closeExportPreview]);

  return (
    <>
      {hasDisplayData && (
        <button
          type="button"
          className={`playExportButton${isOvertimeGame ? ' isIconOnlyDesktop' : ''}`}
          onClick={handleExportImage}
          disabled={exportDisabled}
          aria-label={isExporting ? 'Preparing share image' : 'Share image'}
          title={isExporting ? 'Preparing share image...' : 'Share image'}
        >
          <svg
            className="playExportButtonIcon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v12" />
            <path d="M8 7l4-4 4 4" />
            <path d="M4 14v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" />
          </svg>
          <span className="playExportButtonLabel">
            {isExporting ? 'Preparing...' : 'Share Image'}
          </span>
        </button>
      )}

      {exportError && (
        <div className="playExportError" role="status" aria-live="polite">
          <span>{exportError}</span>
          <button
            type="button"
            className="playExportErrorDismiss"
            onClick={clearExportError}
            aria-label="Dismiss export error"
          >
            Dismiss
          </button>
        </div>
      )}

      {exportPreview && (
        <div
          className="playExportPreview"
          role="dialog"
          aria-label="Play-by-play image preview"
          ref={exportPreviewRef}
        >
          <div className="playExportPreviewHeader">
            <span>Image Builder</span>
            <button
              type="button"
              className="playExportPreviewClose"
              onClick={closeExportPreview}
              aria-label="Close image preview"
            >
              Close
            </button>
          </div>
          <div className="playExportPreviewOptions">
            <label className="playExportOption">
              <span>View</span>
              <select
                value={exportView}
                onChange={(event) => setExportView(event.target.value)}
                disabled={isExporting || previewIsUpdating}
              >
                {exportViewOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {exportView !== 'full' && (
              <label className="playExportOption">
                <span>Player</span>
                <select
                  value={exportPlayerKey}
                  onChange={(event) => setExportPlayerKey(event.target.value)}
                  disabled={isExporting || previewIsUpdating || !exportPlayerOptions.length}
                >
                  {exportPlayerOptions.length ? (
                    exportPlayerOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>
                      No players
                    </option>
                  )}
                </select>
              </label>
            )}
            {exportRangeOptions.length > 0 && (
              <div className="playExportRange">
                <label className="playExportOption">
                  <span>Start</span>
                  <select
                    value={resolvedExportRange.start}
                    onChange={handleExportRangeStartChange}
                    disabled={isExporting || previewIsUpdating}
                  >
                    {exportRangeOptions.map(({ period, label }) => (
                      <option key={period} value={period}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="playExportOption">
                  <span>End</span>
                  <select
                    value={resolvedExportRange.end}
                    onChange={handleExportRangeEndChange}
                    disabled={isExporting || previewIsUpdating}
                  >
                    {filteredRangeEndOptions.map(({ period, label }) => (
                      <option key={period} value={period}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <div className="playExportOption playExportCaptionOption">
              <div className="playExportCaptionHeader">
                <label htmlFor={captionTextareaId}>Caption</label>
                <div className="playExportCaptionActions">
                  <span className="playExportCaptionCounter">
                    {captionText.length}/{captionMaxLength}
                  </span>
                  <button
                    type="button"
                    className="playExportCaptionClearButton"
                    onClick={handleClearCaption}
                    disabled={isExporting || previewIsUpdating || !captionText.length}
                    aria-label="Clear caption"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className="playExportCaptionApplyButton"
                    onClick={handleApplyCaption}
                    disabled={isExporting || previewIsUpdating || !captionCanApply}
                  >
                    Update caption
                  </button>
                </div>
              </div>
              <textarea
                id={captionTextareaId}
                value={captionText}
                onChange={(event) => handleCaptionChange(event.target.value)}
                disabled={isExporting || previewIsUpdating}
                rows={3}
                maxLength={captionMaxLength}
                placeholder="Add a caption"
              />
            </div>
          </div>
          <div className="playExportPreviewBody">
            <img src={exportPreview.url} alt="Play-by-play export preview" />
          </div>
          <div className="playExportPreviewActions">
            {exportPreview.canShare && (
              <button type="button" className="playExportActionButton" onClick={handleSharePreview}>
                Share
              </button>
            )}
            <a
              className="playExportActionButton isLink"
              href={exportPreview.url}
              target="_blank"
              rel="noopener"
            >
              Open image
            </a>
            <button
              type="button"
              className="playExportActionButton isIconOnly"
              onClick={handleDownloadPreview}
              disabled={previewIsUpdating}
              aria-label="Download image"
              title="Download image"
            >
              <svg
                className="playExportActionIcon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3v12" />
                <path d="M8 11l4 4 4-4" />
                <path d="M4 21h16" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
