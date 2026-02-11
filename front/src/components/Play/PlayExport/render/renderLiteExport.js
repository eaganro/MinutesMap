import {
  DESKTOP_EXPORT_WIDTH,
  drawLegend,
  drawStepScoreDiff,
  drawWatermark,
  getCssVar,
  getFullTimelineLegendScale,
  getPeriodCountFromRange,
  getQuarterAwareLegendGap,
  measureLegendHeight,
} from '../playExportCore';
import {
  createExportCanvasContext,
  drawCommonHeaderMeta,
  getExportComputedStyle,
  getScoreTimelineSource,
} from './renderSharedPrimitives';

export const renderLiteExportCanvas = ({
  exportWidth,
  legendShouldWrap,
  rangeLabel,
  periodRange,
  rightMargin,
  playRef,
  gameDate,
  displayAwayTeamNames,
  displayHomeTeamNames,
  filteredScoreTimeline,
  displayScoreTimeline,
  statusLabel,
  endAtLastScore,
  endAtSeconds,
  startScoreDiff,
  timelineWindow,
  maxY,
  showScoreDiff,
  statOn,
  awayColor,
  homeColor,
}) => {
  const contentWidth = exportWidth || DESKTOP_EXPORT_WIDTH;
  const outerPadding = 12;
  const rightPad = rightMargin;
  const headerHeight = 54;
  const footerHeight = 32;
  const computed = getExportComputedStyle(playRef);
  if (!computed) return null;

  const periodCount = getPeriodCountFromRange(periodRange);
  const legendScale = getFullTimelineLegendScale(periodCount);
  const legendTopGap = getQuarterAwareLegendGap(periodCount, 6, 12);
  const legendMeasureCtx = document.createElement('canvas').getContext('2d');
  const legendHeight = measureLegendHeight(
    legendMeasureCtx,
    computed,
    contentWidth - 24,
    legendShouldWrap,
    statOn,
    showScoreDiff,
    true,
    legendScale,
  );

  const chartHeight = 360;
  const chartTop = headerHeight + 8;
  const chartLeft = rightPad;
  const chartWidth = Math.max(1, contentWidth - chartLeft - rightPad);
  const contentHeight = chartTop + chartHeight + footerHeight + legendHeight;

  const canvasContext = createExportCanvasContext({
    contentWidth,
    contentHeight,
    playRef,
    outerPadding,
    computedStyle: computed,
  });
  if (!canvasContext) return null;
  const { canvas, ctx } = canvasContext;

  const textPrimary = getCssVar(computed, '--text-primary', '#111111');
  const textSecondary = getCssVar(computed, '--text-secondary', '#666666');
  const lineColor = getCssVar(computed, '--line-color', '#cccccc');

  const awayLabel = displayAwayTeamNames?.abr || 'Away';
  const homeLabel = displayHomeTeamNames?.abr || 'Home';
  const scoreTimelineSource = getScoreTimelineSource(filteredScoreTimeline, displayScoreTimeline);

  drawCommonHeaderMeta({
    ctx,
    contentWidth,
    rightPad: 20,
    awayLabel,
    homeLabel,
    rangeLabel,
    gameDate,
    scoreTimelineSource,
    statusLabel,
    textPrimary,
    textSecondary,
    titleY: 24,
    dateY: 40,
    scoreY: 24,
    statusY: 40,
    titleFont: '600 18px system-ui, -apple-system, sans-serif',
  });

  const baselineY = chartTop + chartHeight / 2;
  ctx.strokeStyle = lineColor;
  ctx.beginPath();
  ctx.moveTo(chartLeft, baselineY);
  ctx.lineTo(chartLeft + chartWidth, baselineY);
  ctx.stroke();

  ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = awayColor || textSecondary;
  ctx.fillText(`${awayLabel} lead`, chartLeft + 4, chartTop + 14);
  ctx.fillStyle = homeColor || textSecondary;
  ctx.fillText(`${homeLabel} lead`, chartLeft + 4, chartTop + chartHeight - 4);

  if (!showScoreDiff) {
    ctx.fillStyle = textSecondary;
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    ctx.fillText('Score diff hidden', chartLeft + 6, baselineY - 6);
    return canvas;
  }

  const windowDurationSeconds = timelineWindow?.durationSeconds ?? 0;
  if (windowDurationSeconds <= 0) {
    ctx.fillStyle = textSecondary;
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    ctx.fillText('No timeline data', chartLeft + 6, baselineY - 6);
    return canvas;
  }

  drawStepScoreDiff({
    ctx,
    baselineY,
    chartLeft,
    chartWidth,
    chartHeight,
    maxY: maxY || 1,
    startScoreDiff,
    timelineWindow,
    scoreTimeline: scoreTimelineSource,
    awayColor: awayColor || lineColor,
    homeColor: homeColor || lineColor,
    endAtLastScore,
    endAtSeconds,
  });

  const legendTop = chartTop + chartHeight + legendTopGap;
  drawLegend(
    ctx,
    computed,
    12,
    legendTop,
    contentWidth - 24,
    legendShouldWrap,
    statOn,
    showScoreDiff,
    true,
    legendScale,
  );
  drawWatermark(ctx, computed, 6, contentHeight - 6);

  return canvas;
};
