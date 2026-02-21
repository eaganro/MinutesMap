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
  drawCaptionBlock,
  drawCenteredScoreHeader,
  getExportComputedStyle,
  measureCaptionBlockHeight,
  measureCenteredScoreHeaderHeight,
  getScoreTimelineSource,
} from './renderSharedPrimitives';

export const renderLiteExportCanvas = ({
  exportWidth,
  legendShouldWrap,
  periodRange,
  rightMargin,
  playRef,
  displayAwayTeamNames,
  displayHomeTeamNames,
  filteredScoreTimeline,
  displayScoreTimeline,
  captionText,
  teamLogos,
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
  const captionHeight = measureCaptionBlockHeight({
    measureCtx: legendMeasureCtx,
    text: captionText,
    maxWidth: contentWidth - 24,
  });
  const captionTopGap = captionHeight > 0 ? 6 : 0;
  const captionBottomGap = captionHeight > 0 ? 8 : 0;
  const headerHeight = measureCenteredScoreHeaderHeight({ statusLabel });

  const chartHeight = 360;
  const chartTop = headerHeight + captionTopGap + captionHeight + captionBottomGap;
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

  drawCenteredScoreHeader({
    ctx,
    contentWidth,
    awayLabel,
    homeLabel,
    scoreTimelineSource,
    statusLabel,
    textPrimary,
    textSecondary,
    teamLogos,
    y: 0,
  });
  if (captionHeight > 0) {
    drawCaptionBlock({
      ctx,
      text: captionText,
      x: 12,
      y: headerHeight + captionTopGap,
      maxWidth: contentWidth - 24,
      color: textSecondary,
      textAlign: 'center',
    });
  }

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
