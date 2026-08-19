import { useCallback, useEffect, useRef, useState } from 'react';
import { EVENT_TYPES, LegendShape, renderFreeThrowRing } from '../../ui/eventShapes.jsx';
import './StatButtons.scss';

const STAT_HOVER_PREVIEW_DELAY_MS = 500;
const STAT_HOLD_ISOLATE_DELAY_MS = 500;
const EVENT_KEYS = Object.keys(EVENT_TYPES);

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
  const isInteractive = !isLoading && !statusMessage;
  const hoverPreviewTimeoutRef = useRef(null);
  const activeHoverStatRef = useRef(null);
  const holdTimeoutRef = useRef(null);
  const holdActiveRef = useRef(false);
  const holdCompletedRef = useRef(false);
  const suppressNextClickRef = useRef(false);
  const [holdStatIndex, setHoldStatIndex] = useState(null);

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
      if (!isInteractive || statOn[index] === false || holdActiveRef.current) return;

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

  const clearStatHold = useCallback(() => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    holdActiveRef.current = false;
    setHoldStatIndex(null);
  }, []);

  const isolateStat = useCallback(
    (index) => {
      const activeStatCount = statOn.filter(Boolean).length;
      const shouldTurnAllOn = activeStatCount === 0 || (activeStatCount === 1 && statOn[index]);

      if (shouldTurnAllOn) {
        EVENT_KEYS.forEach((_, statIndex) => {
          if (!statOn[statIndex]) {
            changeStatOn(statIndex);
          }
        });
        return;
      }

      if (statOn[index] === false) {
        changeStatOn(index);
      }

      EVENT_KEYS.forEach((_, statIndex) => {
        if (statIndex !== index && statOn[statIndex]) {
          changeStatOn(statIndex);
        }
      });
    },
    [changeStatOn, statOn],
  );

  const completeStatHold = useCallback(
    (index) => {
      holdTimeoutRef.current = null;
      holdActiveRef.current = false;
      holdCompletedRef.current = true;
      setHoldStatIndex(null);
      clearStatHoverPreview();
      isolateStat(index);
    },
    [clearStatHoverPreview, isolateStat],
  );

  const startStatHold = useCallback(
    (event, index) => {
      if (!isInteractive || (event.button !== undefined && event.button !== 0)) return;

      clearStatHold();
      clearStatHoverPreview();
      holdActiveRef.current = true;
      holdCompletedRef.current = false;
      setHoldStatIndex(index);
      holdTimeoutRef.current = window.setTimeout(() => {
        completeStatHold(index);
      }, STAT_HOLD_ISOLATE_DELAY_MS);
    },
    [clearStatHold, clearStatHoverPreview, completeStatHold, isInteractive],
  );

  const endStatHold = useCallback(() => {
    const completed = holdCompletedRef.current;
    clearStatHold();
    if (completed) {
      suppressNextClickRef.current = true;
      holdCompletedRef.current = false;
    }
  }, [clearStatHold]);

  useEffect(() => clearStatHold, [clearStatHold]);

  const handleToggle = (index) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
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

  const buttons = EVENT_KEYS.map((key, i) => {
    const isActive = statOn[i];
    const isPoint = key === 'point';
    const isMiss = key === 'miss';
    const pointLegendSize = 12;

    return (
      <button
        type="button"
        className={`buttonGroup ${isActive ? '' : 'off'} ${isPoint || isMiss ? 'subLegend' : ''} ${holdStatIndex === i ? 'isHoldCharging' : ''}`}
        key={key}
        onClick={() => handleToggle(i)}
        onMouseEnter={() => startStatHoverPreview(i)}
        onMouseLeave={clearStatHoverPreview}
        onPointerDown={(event) => startStatHold(event, i)}
        onPointerUp={endStatHold}
        onPointerCancel={endStatHold}
        onPointerLeave={(event) => {
          clearStatHoverPreview(event);
          endStatHold();
        }}
        aria-label={EVENT_TYPES[key].label}
        aria-pressed={isActive}
        disabled={!isInteractive}
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
      </button>
    );
  });

  // Score differential toggle
  const scoreDiffButton = (
    <button
      type="button"
      className={`buttonGroup scoreDiff ${showScoreDiff ? '' : 'off'}`}
      onClick={() => {
        if (!isInteractive) return;
        setShowScoreDiff(!showScoreDiff);
      }}
      aria-pressed={showScoreDiff}
      disabled={!isInteractive}
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
    </button>
  );

  const oddsButton = (
    <button
      type="button"
      className={`buttonGroup oddsOverlay ${showOdds ? '' : 'off'}`}
      onClick={() => {
        if (!isInteractive) return;
        setShowOdds(!showOdds);
      }}
      aria-pressed={showOdds}
      disabled={!isInteractive}
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
    </button>
  );

  return (
    <div
      className={`statButtons ${!isInteractive ? 'isLoading' : ''}`}
      role="group"
      aria-label="Play filters"
    >
      {buttons}
      <div className="separator" aria-hidden="true" />
      {scoreDiffButton}
      {oddsButton}
    </div>
  );
}
