import { useMemo } from 'react';
import { getSecondsElapsed } from '../../helpers/playTimeline';

const TOP_Y = 10;
const BOTTOM_Y = 590;
const MID_Y = 300;

const clampProb = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(1, parsed));
};

const probToY = (awayWinProb) => {
  const prob = clampProb(awayWinProb);
  if (prob === null) return null;
  return BOTTOM_Y - prob * (BOTTOM_Y - TOP_Y);
};

export default function OddsGraph({
  oddsTimeline,
  lastAction,
  width,
  leftMargin,
  timelineWindow,
  showOdds,
  startOddsProb = null,
}) {
  const points = useMemo(() => {
    if (!showOdds) {
      return '';
    }

    const windowStartSeconds = timelineWindow?.startSeconds ?? 0;
    const windowDurationSeconds = timelineWindow?.durationSeconds ?? 0;
    if (windowDurationSeconds <= 0) {
      return '';
    }

    const getXForEntry = (entry) => {
      const elapsed = getSecondsElapsed(entry.period, entry.clock);
      const offset = elapsed - windowStartSeconds;
      const ratio = offset / windowDurationSeconds;
      return leftMargin + Math.max(0, Math.min(width, ratio * width));
    };

    const safeTimeline = (oddsTimeline || []).filter(
      (entry) => clampProb(entry?.awayWinProb) !== null,
    );
    const segments = [];
    let currentX = leftMargin;
    let currentProb = clampProb(startOddsProb);

    if (currentProb === null && safeTimeline.length) {
      currentProb = clampProb(safeTimeline[0]?.awayWinProb);
      currentX = getXForEntry(safeTimeline[0]);
    }

    safeTimeline.forEach((entry) => {
      const nextProb = clampProb(entry.awayWinProb);
      if (nextProb === null) return;
      const nextX = getXForEntry(entry);

      if (!segments.length && currentProb !== null) {
        segments.push(`${currentX},${probToY(currentProb)}`);
      }

      if (currentProb !== null) {
        segments.push(`${nextX},${probToY(currentProb)}`);
      }

      segments.push(`${nextX},${probToY(nextProb)}`);
      currentX = nextX;
      currentProb = nextProb;
    });

    const lineEndX = lastAction ? getXForEntry(lastAction) : leftMargin + width;
    if (currentProb !== null) {
      if (!segments.length) {
        segments.push(`${leftMargin},${probToY(currentProb)}`);
      }
      const finalX = Math.max(currentX, lineEndX);
      segments.push(`${finalX},${probToY(currentProb)}`);
    }

    return segments.join(' ');
  }, [oddsTimeline, lastAction, width, leftMargin, timelineWindow, showOdds, startOddsProb]);

  if (!showOdds || !points) {
    return null;
  }

  return (
    <>
      <line
        x1={leftMargin}
        y1={MID_Y}
        x2={leftMargin + width}
        y2={MID_Y}
        style={{ stroke: 'var(--odds-line-color)', strokeWidth: 0.5, strokeOpacity: 0.2 }}
      />
      <polyline
        points={points}
        fill="none"
        style={{ stroke: 'var(--odds-line-color)', strokeWidth: 2, strokeLinejoin: 'round' }}
      />
    </>
  );
}
