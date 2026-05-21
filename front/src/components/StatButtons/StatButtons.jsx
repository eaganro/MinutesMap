import { useCallback, useEffect, useRef } from 'react';
import { EVENT_TYPES, LegendShape, renderFreeThrowRing } from '../../ui/eventShapes.jsx';
import './StatButtons.scss';

const STAT_HOVER_PREVIEW_DELAY_MS = 500;

export default function StatButtons({
  statOn,
  changeStatOn,
  showScoreDiff,
  setShowScoreDiff,
  showOdds = false,
  setShowOdds = () => {},
  isLoading,
  statusMessage,
  onStatHoverChange = () => {},
}) {
  const eventKeys = Object.keys(EVENT_TYPES);
  const isInteractive = !isLoading && !statusMessage;
  const hoverPreviewTimeoutRef = useRef(null);
  const activeHoverStatRef = useRef(null);

  const clearStatHoverPreview = useCallback(() => {
    if (hoverPreviewTimeoutRef.current) {
      clearTimeout(hoverPreviewTimeoutRef.current);
      hoverPreviewTimeoutRef.current = null;
    }

    if (activeHoverStatRef.current !== null) {
      activeHoverStatRef.current = null;
      onStatHoverChange(null);
    }
  }, [onStatHoverChange]);

  const startStatHoverPreview = useCallback(
    (index) => {
      clearStatHoverPreview();
      if (!isInteractive || statOn[index] === false) return;

      hoverPreviewTimeoutRef.current = window.setTimeout(() => {
        hoverPreviewTimeoutRef.current = null;
        activeHoverStatRef.current = index;
        onStatHoverChange(index);
      }, STAT_HOVER_PREVIEW_DELAY_MS);
    },
    [clearStatHoverPreview, isInteractive, onStatHoverChange, statOn],
  );

  useEffect(() => clearStatHoverPreview, [clearStatHoverPreview]);

  useEffect(() => {
    const activeHoverStat = activeHoverStatRef.current;
    if (!isInteractive || (activeHoverStat !== null && statOn[activeHoverStat] === false)) {
      clearStatHoverPreview();
    }
  }, [clearStatHoverPreview, isInteractive, statOn]);

  const handleToggle = (index) => {
    if (!isInteractive) return;
    clearStatHoverPreview();
    changeStatOn(index);
  };

  const renderFreeThrowLegendIcon = (size = 10, isMiss = false) => {
    const padding = 2;
    const viewSize = size + padding * 2;
    const center = viewSize / 2;
    return (
      <svg
        width={viewSize}
        height={viewSize}
        viewBox={`0 0 ${viewSize} ${viewSize}`}
        style={{ display: 'inline-block', verticalAlign: 'middle' }}
      >
        {renderFreeThrowRing({
          cx: center,
          cy: center,
          size: size / 2,
          key: 'legend-ft-ring',
          description: isMiss ? 'MISS free throw 1 of 1' : 'free throw 1 of 1',
        })}
      </svg>
    );
  };

  const buttons = eventKeys.map((key, i) => {
    const isActive = statOn[i];
    const isPoint = key === 'point';
    const isMiss = key === 'miss';
    const pointLegendSize = 12;

    return (
      <div
        className={`buttonGroup ${isActive ? '' : 'off'} ${isPoint || isMiss ? 'subLegend' : ''}`}
        key={key}
        onClick={() => handleToggle(i)}
        onMouseEnter={() => startStatHoverPreview(i)}
        onMouseLeave={clearStatHoverPreview}
        aria-disabled={!isInteractive}
      >
        {isPoint ? (
          <div className="subLegendRow" aria-hidden="true">
            <div className="subLegendItem">
              <LegendShape eventType="point" size={pointLegendSize} />
              <span className="subLegendLabel">2PT</span>
            </div>
            <div className="subLegendItem">
              <LegendShape eventType="point" size={pointLegendSize} is3PT />
              <span className="subLegendLabel">3PT</span>
            </div>
            <div className="subLegendItem">
              {renderFreeThrowLegendIcon(pointLegendSize)}
              <span className="subLegendLabel">FT</span>
            </div>
          </div>
        ) : isMiss ? (
          <div className="subLegendRow" aria-hidden="true">
            <div className="subLegendItem">
              <LegendShape eventType="miss" size={pointLegendSize} />
              <span className="subLegendLabel">Miss</span>
            </div>
            <div className="subLegendItem">
              <LegendShape eventType="miss" size={pointLegendSize} is3PT />
              <span className="subLegendLabel">3PT</span>
            </div>
            <div className="subLegendItem">
              {renderFreeThrowLegendIcon(pointLegendSize, true)}
              <span className="subLegendLabel">FT</span>
            </div>
          </div>
        ) : (
          <>
            <div className="shapeContainer">
              <LegendShape eventType={key} size={18} />
            </div>
            <span className="label">{EVENT_TYPES[key].label}</span>
          </>
        )}
      </div>
    );
  });

  // Score differential toggle
  const scoreDiffButton = (
    <div
      className={`buttonGroup scoreDiff ${showScoreDiff ? '' : 'off'}`}
      onClick={() => {
        if (!isInteractive) return;
        setShowScoreDiff(!showScoreDiff);
      }}
      aria-disabled={!isInteractive}
    >
      <div className="shapeContainer scoreDiffIcon">
        <svg width="18" height="18" viewBox="0 0 18 18">
          <path
            d="M1 9 L5 5 L9 9 L13 4 L17 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M1 9 L5 5 L9 9 L13 4 L17 7 L17 14 L1 14 Z" fill="currentColor" opacity="0.3" />
        </svg>
      </div>
      <span className="label">Score Lead</span>
    </div>
  );

  const oddsButton = (
    <div
      className={`buttonGroup oddsOverlay ${showOdds ? '' : 'off'}`}
      onClick={() => {
        if (!isInteractive) return;
        setShowOdds(!showOdds);
      }}
      aria-disabled={!isInteractive}
    >
      <div className="shapeContainer oddsIcon">
        <svg width="18" height="18" viewBox="0 0 18 18">
          <path
            d="M1 14 L5 11 L9 9 L13 5 L17 3"
            fill="none"
            stroke="var(--odds-line-color)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span className="label">Win Odds</span>
    </div>
  );

  return (
    <div className={`statButtons ${!isInteractive ? 'isLoading' : ''}`}>
      {buttons}
      <div className="separator" />
      {scoreDiffButton}
      {oddsButton}
    </div>
  );
}
