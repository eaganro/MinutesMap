import { useMemo } from 'react';
import { getSecondsElapsed } from '../../helpers/playTimeline';

export default function ScoreGraph({ 
  scoreTimeline, 
  lastAction,
  width, 
  leftMargin, 
  timelineWindow,
  maxY, 
  showScoreDiff, 
  awayColor, 
  homeColor,
  startScoreDiff = 0
}) {

  const { pospoints, negpoints } = useMemo(() => {
    if (!showScoreDiff) {
      return { pospoints: '', negpoints: '' };
    }

    let starty = (startScoreDiff * -300) / maxY;
    // Initial starting point at the center line (y=300 relative to SVG height)
    let pospointsArr = [`${leftMargin},300`];
    let negpointsArr = [`${leftMargin},300`];
    let pos = starty <= 0; // Tracks if we are currently in positive (Away lead) territory

    if (starty < 0) {
      pospointsArr.push(`${leftMargin},${300 + starty}`);
    } else if (starty > 0) {
      negpointsArr.push(`${leftMargin},${300 + starty}`);
    }

    const safeTimeline = scoreTimeline || [];
    const windowStartSeconds = timelineWindow?.startSeconds ?? 0;
    const windowDurationSeconds = timelineWindow?.durationSeconds ?? 0;
    if (windowDurationSeconds <= 0) {
      return { pospoints: '', negpoints: '' };
    }

    const getXForAction = (action) => {
      const elapsed = getSecondsElapsed(action.period, action.clock);
      const offset = elapsed - windowStartSeconds;
      const ratio = offset / windowDurationSeconds;
      return Math.max(0, Math.min(width, ratio * width));
    };

    safeTimeline.forEach((t) => {
      const scoreDiff = Number(t.away) - Number(t.home);

      const x2 = getXForAction(t);

      let y1 = starty;
      // Calculate Y based on score differential, scaled to max lead
      // 300 is the center point of the 600px height SVG
      let y2 = scoreDiff * -300 / maxY;

      // Logic to handle crossing the x-axis (lead change)
      if (y1 <= 0) {
        pos = true;
        pospointsArr.push(`${leftMargin + x2},${300 + y1}`);
        if (y2 <= 0) {
          // Still positive
          pospointsArr.push(`${leftMargin + x2},${300 + y2}`);
        } else {
          // Crossed from positive to negative
          pos = false;
          pospointsArr.push(`${leftMargin + x2},${300}`);
          negpointsArr.push(`${leftMargin + x2},${300}`);
          negpointsArr.push(`${leftMargin + x2},${300 + y2}`);
        }
      } else {
        pos = false;
        negpointsArr.push(`${leftMargin + x2},${300 + y1}`);
        if (y2 >= 0) {
          // Still negative
          negpointsArr.push(`${leftMargin + x2},${300 + y2}`);
        } else {
          // Crossed from negative to positive
          pos = true;
          negpointsArr.push(`${leftMargin + x2},${300}`);
          pospointsArr.push(`${leftMargin + x2},${300}`);
          pospointsArr.push(`${leftMargin + x2},${300 + y2}`);
        }
      }

      starty = y2;
    });

    // Close the shape at the last recorded action
    const endX = lastAction ? getXForAction(lastAction) : width;
    if (Number.isFinite(endX)) {

      // Extend the graph to the final second
      if (pos) {
        pospointsArr.push(`${leftMargin + endX},${300 + starty}`);
        pospointsArr.push(`${leftMargin + endX},300`);
        // Push "off-screen" to ensure fill closes cleanly if needed, though usually not required for polyline
        negpointsArr.push(`2000,300`); 
      } else {
        negpointsArr.push(`${leftMargin + endX},${300 + starty}`);
        negpointsArr.push(`${leftMargin + endX},300`);
        pospointsArr.push(`2000,300`);
      }
    }

    return { 
      pospoints: pospointsArr.join(' '), 
      negpoints: negpointsArr.join(' ') 
    };
  }, [scoreTimeline, lastAction, width, leftMargin, maxY, showScoreDiff, timelineWindow, startScoreDiff]);

  if (!showScoreDiff) {
    return null;
  }

  return (
    <>
      <polyline points={pospoints} style={{ fill: awayColor }} />
      <polyline points={negpoints} style={{ fill: homeColor }} />
    </>
  );
}
