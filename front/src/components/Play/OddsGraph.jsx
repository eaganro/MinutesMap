import { useMemo } from 'react';
import { clampWinProbability } from '../../helpers/odds';
import { getSecondsElapsed } from '../../helpers/playTimeline';

const MID_Y = 300;
const ODDS_LINE_STROKE_WIDTH = 0.5;

// A certain win sits edgeY from the top (away) or bottom (home), 50/50 on the middle line.
const probToY = (awayWinProb, edgeY) => {
  const prob = clampWinProbability(awayWinProb);
  if (prob === null) return null;
  const bottomY = 2 * MID_Y - edgeY;
  return bottomY - prob * (bottomY - edgeY);
};

export default function OddsGraph({
  oddsTimeline,
  lastAction,
  width,
  leftMargin,
  timelineWindow,
  showOdds,
  startOddsProb = null,
  // Larger on phones, where the period buttons fill the top band.
  edgeY = 10,
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
      (entry) => clampWinProbability(entry?.awayWinProb) !== null,
    );
    const segments = [];
    let currentX = leftMargin;
    let currentProb = clampWinProbability(startOddsProb);

    if (currentProb === null && safeTimeline.length) {
      currentProb = clampWinProbability(safeTimeline[0]?.awayWinProb);
      currentX = getXForEntry(safeTimeline[0]);
    }

    safeTimeline.forEach((entry) => {
      const nextProb = clampWinProbability(entry.awayWinProb);
      if (nextProb === null) return;
      const nextX = getXForEntry(entry);

      if (!segments.length && currentProb !== null) {
        segments.push(`${currentX},${probToY(currentProb, edgeY)}`);
      }

      if (currentProb !== null) {
        segments.push(`${nextX},${probToY(currentProb, edgeY)}`);
      }

      segments.push(`${nextX},${probToY(nextProb, edgeY)}`);
      currentX = nextX;
      currentProb = nextProb;
    });

    const lineEndX = lastAction ? getXForEntry(lastAction) : leftMargin + width;
    if (currentProb !== null) {
      if (!segments.length) {
        segments.push(`${leftMargin},${probToY(currentProb, edgeY)}`);
      }
      const finalX = Math.max(currentX, lineEndX);
      segments.push(`${finalX},${probToY(currentProb, edgeY)}`);
    }

    return segments.join(' ');
  }, [oddsTimeline, lastAction, width, leftMargin, timelineWindow, showOdds, startOddsProb, edgeY]);

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
        style={{
          stroke: 'var(--odds-line-color)',
          strokeWidth: ODDS_LINE_STROKE_WIDTH,
          strokeLinejoin: 'round',
        }}
      />
    </>
  );
}
