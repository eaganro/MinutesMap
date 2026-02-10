import { getSecondsElapsed } from '../../../helpers/playTimeline';

export const drawStepScoreDiff = ({
  ctx,
  baselineY,
  chartLeft,
  chartWidth,
  chartHeight,
  maxY,
  startScoreDiff,
  timelineWindow,
  scoreTimeline,
  awayColor,
  homeColor,
  endAtLastScore,
  endAtSeconds,
}) => {
  if (!ctx || !scoreTimeline || !chartWidth || maxY <= 0) return;
  const windowStartSeconds = timelineWindow?.startSeconds ?? 0;
  const windowDurationSeconds = timelineWindow?.durationSeconds ?? 0;
  if (windowDurationSeconds <= 0) return;

  const endX = chartLeft + chartWidth;
  const diffToY = (diff) => baselineY - (diff / maxY) * (chartHeight / 2);
  const steps = [];

  scoreTimeline.forEach((entry) => {
    const elapsed = getSecondsElapsed(entry.period, entry.clock);
    if (elapsed < windowStartSeconds || elapsed > windowStartSeconds + windowDurationSeconds) {
      return;
    }
    const ratio = (elapsed - windowStartSeconds) / windowDurationSeconds;
    const x = chartLeft + ratio * chartWidth;
    steps.push({
      x,
      diff: Number(entry.away) - Number(entry.home),
    });
  });

  let currentDiff = startScoreDiff;
  let currentX = chartLeft;

  const drawSegment = (nextX) => {
    if (nextX <= currentX || currentDiff === 0) {
      currentX = nextX;
      return;
    }
    const y = diffToY(currentDiff);
    ctx.fillStyle = currentDiff > 0 ? awayColor : homeColor;
    const top = Math.min(y, baselineY);
    const height = Math.abs(baselineY - y);
    ctx.fillRect(currentX, top, nextX - currentX, height);
    currentX = nextX;
  };

  steps.forEach((step) => {
    const nextX = Math.min(endX, Math.max(chartLeft, step.x));
    drawSegment(nextX);
    currentDiff = step.diff;
  });

  const hasSteps = steps.length > 0;
  const lastStepX = hasSteps
    ? Math.min(endX, Math.max(chartLeft, steps[steps.length - 1].x))
    : endX;
  let finalFillEndX = endX;
  let shouldDropToZero = false;
  if (Number.isFinite(endAtSeconds)) {
    const ratio = (endAtSeconds - windowStartSeconds) / windowDurationSeconds;
    finalFillEndX = chartLeft + Math.max(0, Math.min(chartWidth, ratio * chartWidth));
    shouldDropToZero = true;
  } else if (endAtLastScore && hasSteps) {
    finalFillEndX = lastStepX;
    shouldDropToZero = true;
  }
  drawSegment(finalFillEndX);
  if (shouldDropToZero) {
    currentDiff = 0;
    drawSegment(endX);
  }
};
