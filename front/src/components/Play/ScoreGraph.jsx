import { useMemo } from 'react';
import { timeToSeconds } from '../../helpers/utils';

export default function ScoreGraph({ 
  scoreTimeline, 
  lastAction,
  width, 
  leftMargin, 
  qWidth, 
  maxY, 
  showScoreDiff, 
  awayColor, 
  homeColor 
}) {

  const { pospoints, negpoints } = useMemo(() => {
    if (!scoreTimeline || scoreTimeline.length === 0) {
      return { pospoints: '', negpoints: '' };
    }

    let startx = 0;
    let starty = 0;
    // Initial starting point at the center line (y=300 relative to SVG height)
    let pospointsArr = [`${leftMargin},300`];
    let negpointsArr = [`${leftMargin},300`];
    let pos = true; // Tracks if we are currently in positive (Away lead) territory

    scoreTimeline.forEach((t) => {
      const scoreDiff = Number(t.away) - Number(t.home);

      // Calculate X based on period and clock
      let x2;
      const secondsRemaining = timeToSeconds(t.clock);
      
      if (t.period <= 4) {
        // Regulation: Periods 1-4
        const secondsPassed = (t.period - 1) * 12 * 60 + 12 * 60 - secondsRemaining;
        x2 = (secondsPassed / (4 * 12 * 60)) * (qWidth * 4);
      } else {
        // Overtime: Periods 5+
        const secondsPassed = 4 * 12 * 60 + 5 * (t.period - 4) * 60 - secondsRemaining;
        x2 = (secondsPassed / (4 * 12 * 60)) * (qWidth * 4);
      }

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

      startx = x2;
      starty = y2;
    });

    // Close the shape at the last recorded action
    if (lastAction) {
      const secondsRemaining = timeToSeconds(lastAction.clock);
      let lastX;
      
      if (lastAction.period <= 4) {
        lastX = (((lastAction.period - 1) * 12 * 60 + 12 * 60 - secondsRemaining) / (4 * 12 * 60)) * (qWidth * 4);
      } else {
        lastX = ((4 * 12 * 60 + 5 * (lastAction.period - 4) * 60 - secondsRemaining) / (4 * 12 * 60)) * (qWidth * 4);
      }

      // Extend the graph to the final second
      if (pos) {
        pospointsArr.push(`${leftMargin + lastX},${300 + starty}`);
        pospointsArr.push(`${leftMargin + lastX},300`);
        // Push "off-screen" to ensure fill closes cleanly if needed, though usually not required for polyline
        negpointsArr.push(`2000,300`); 
      } else {
        negpointsArr.push(`${leftMargin + lastX},${300 + starty}`);
        negpointsArr.push(`${leftMargin + lastX},300`);
        pospointsArr.push(`2000,300`);
      }
    }

    return { 
      pospoints: pospointsArr.join(' '), 
      negpoints: negpointsArr.join(' ') 
    };
  }, [scoreTimeline, lastAction, width, leftMargin, qWidth, maxY]);

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