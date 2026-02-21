import {
  getPeriodDurationSeconds,
  getPeriodStartSeconds,
  getSecondsElapsed,
} from '../../../../helpers/playTimeline';
import {
  BOX_TABLE_HEADER_HEIGHT,
  BOX_TABLE_ROW_HEIGHT,
  DESKTOP_EXPORT_WIDTH,
  TIMELINE_ICON_SCALE,
  buildBoxScoreColumns,
  computePlayerBoxScore,
  drawBoxScoreTable,
  drawLegend,
  drawPeriodCaps,
  drawWatermark,
  formatPeriodLabel,
  getCssVar,
  getPeriodCountFromRange,
  getQuarterAwareLegendGap,
  getQuarterAwareLegendScale,
  measureLegendHeight,
} from '../playExportCore';
import {
  buildMarkerLookups,
  createExportCanvasContext,
  drawCaptionBlock,
  drawCenteredScoreHeader,
  drawRowMarkers,
  filterRenderableActions,
  getExportComputedStyle,
  measureCaptionBlockHeight,
  measureCenteredScoreHeaderHeight,
  getScoreTimelineSource,
} from './renderSharedPrimitives';

export const renderPlayerExportCanvas = ({
  exportWidth,
  legendShouldWrap,
  periodRange,
  rightMargin,
  playRef,
  displayAwayTeamNames,
  displayHomeTeamNames,
  filteredAwayPlayers,
  filteredHomePlayers,
  boxScoreAwayPlayers,
  boxScoreHomePlayers,
  filteredAwayPlayerTimeline,
  filteredHomePlayerTimeline,
  filteredScoreTimeline,
  displayScoreTimeline,
  captionText,
  teamLogos,
  statusLabel,
  timelineWindow,
  statOn,
  showScoreDiff,
  selectedPlayer,
  playerDisplayName,
}) => {
  const contentWidth = exportWidth || DESKTOP_EXPORT_WIDTH;
  const outerPadding = 12;
  const rightPad = rightMargin;
  const topPadding = 8;
  const teamLabelHeight = 0;
  const rowHeight = 48;
  const periodCount = getPeriodCountFromRange(periodRange);
  const bottomPadding = getQuarterAwareLegendGap(periodCount, 6, 12);
  const playAreaHeight = topPadding + teamLabelHeight + 4 + rowHeight + bottomPadding;
  const computed = getExportComputedStyle(playRef);
  if (!computed) return null;

  const legendScale = getQuarterAwareLegendScale(periodCount);
  const legendMeasureCtx = document.createElement('canvas').getContext('2d');
  const legendHeight = measureLegendHeight(
    legendMeasureCtx,
    computed,
    contentWidth - 24,
    legendShouldWrap,
    statOn,
    showScoreDiff,
    false,
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
  const playAreaTop = headerHeight + captionTopGap + captionHeight + captionBottomGap;
  const chartTop = playAreaTop;
  const chartLeft = rightPad;
  const chartWidth = Math.max(1, contentWidth - chartLeft - rightPad);

  const hasPlayer = Boolean(selectedPlayer?.name);
  const isAway =
    hasPlayer && (selectedPlayer?.teamKey === 'away' || selectedPlayer?.team === 'away');
  const teamKey = hasPlayer ? (isAway ? 'away' : 'home') : null;
  const playerName = selectedPlayer?.name || '';
  const playerLabel = playerDisplayName || playerName;
  const actions = (isAway ? filteredAwayPlayers : filteredHomePlayers)?.[playerName] || [];
  const boxScoreActions =
    (isAway ? boxScoreAwayPlayers : boxScoreHomePlayers)?.[playerName] || actions;
  const timeline =
    (isAway ? filteredAwayPlayerTimeline : filteredHomePlayerTimeline)?.[playerName] || [];
  const boxScoreStats = computePlayerBoxScore({
    actions: boxScoreActions,
    timeline,
    scoreTimeline: filteredScoreTimeline,
    displayScoreTimeline,
    periodRange,
    teamKey,
  });
  const boxScoreItems = buildBoxScoreColumns(boxScoreStats, playerLabel, true);
  const boxScoreGap = boxScoreItems.length ? 10 : 0;
  const boxScoreWidth = contentWidth;
  const boxScoreX = Math.max(0, (contentWidth - boxScoreWidth) / 2);
  const boxScoreHeight = boxScoreItems.length ? BOX_TABLE_HEADER_HEIGHT + BOX_TABLE_ROW_HEIGHT : 0;
  const boxScoreBottomPadding = boxScoreItems.length ? 38 : 16;
  const contentHeight =
    playAreaTop +
    playAreaHeight +
    legendHeight +
    boxScoreGap +
    boxScoreHeight +
    boxScoreBottomPadding;

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
  const textSecondary = getCssVar(computed, '--text-secondary', '#6b7280');
  const lineColor = getCssVar(computed, '--line-color', '#cbd5f5');
  const lineLight = getCssVar(computed, '--line-color-light', '#94a3b8');
  const quarterLabelColor = getCssVar(computed, '--quarter-label-color', '#6b7280');

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

  const windowStartSeconds = timelineWindow?.startSeconds ?? 0;
  const windowDurationSeconds = timelineWindow?.durationSeconds ?? 0;
  const getXForSeconds = (seconds) => {
    if (windowDurationSeconds <= 0) return chartLeft;
    const ratio = (seconds - windowStartSeconds) / windowDurationSeconds;
    return chartLeft + Math.max(0, Math.min(chartWidth, ratio * chartWidth));
  };
  const timelineBottom = playAreaTop + playAreaHeight;
  const rangeStart = Number(periodRange?.start);
  const rangeEnd = Number(periodRange?.end);

  if (
    windowDurationSeconds > 0 &&
    Number.isFinite(rangeStart) &&
    Number.isFinite(rangeEnd) &&
    rangeEnd >= rangeStart
  ) {
    ctx.strokeStyle = lineColor;
    for (let period = rangeStart + 1; period <= rangeEnd; period += 1) {
      const x = getXForSeconds(getPeriodStartSeconds(period));
      ctx.beginPath();
      ctx.moveTo(x, chartTop);
      ctx.lineTo(x, timelineBottom);
      ctx.stroke();
    }

    if (rangeEnd > rangeStart) {
      ctx.fillStyle = quarterLabelColor;
      ctx.font = '600 10px system-ui, -apple-system, sans-serif';
      const labelY = chartTop + 10;
      for (let period = rangeStart; period <= rangeEnd; period += 1) {
        const label = formatPeriodLabel(period);
        if (!label) continue;
        const centerSeconds = getPeriodStartSeconds(period) + getPeriodDurationSeconds(period) / 2;
        const x = getXForSeconds(centerSeconds);
        ctx.fillText(label, x - ctx.measureText(label).width / 2, labelY);
      }
    }
  }

  const sectionTop = chartTop + topPadding;

  const rowTop = sectionTop + 4;
  const centerY = rowTop + rowHeight / 2;
  ctx.textBaseline = 'middle';

  const getXForTime = (period, clock) => {
    const elapsed = getSecondsElapsed(period, clock);
    return getXForSeconds(elapsed);
  };

  if (
    windowDurationSeconds > 0 &&
    Number.isFinite(rangeStart) &&
    Number.isFinite(rangeEnd) &&
    rangeEnd >= rangeStart
  ) {
    for (let period = rangeStart; period <= rangeEnd; period += 1) {
      const startSeconds = getPeriodStartSeconds(period);
      const endSeconds = startSeconds + getPeriodDurationSeconds(period);
      const xStart = getXForSeconds(startSeconds);
      const xEnd = getXForSeconds(endSeconds);
      drawPeriodCaps(ctx, xStart, xEnd, centerY, lineLight);
    }
  }

  ctx.strokeStyle = lineLight;
  ctx.lineWidth = 1;
  timeline.forEach((entry) => {
    if (!entry?.end) return;
    const x1 = getXForTime(entry.period, entry.start);
    const x2 = getXForTime(entry.period, entry.end);
    ctx.beginPath();
    ctx.moveTo(x1, centerY);
    ctx.lineTo(x2, centerY);
    ctx.stroke();
  });

  const filteredActions = filterRenderableActions(actions);
  const markerLookups = buildMarkerLookups(filteredActions);
  const size = Math.max(3, Math.min(5, rowHeight * 0.28)) * TIMELINE_ICON_SCALE;
  drawRowMarkers({
    ctx,
    actions: filteredActions,
    markerLookups,
    getXForAction: (action) => getXForTime(action.period, action.clock),
    centerY,
    size,
    computedStyle: computed,
  });

  const legendTop = playAreaTop + playAreaHeight + 10;
  drawLegend(
    ctx,
    computed,
    12,
    legendTop,
    contentWidth - 24,
    legendShouldWrap,
    statOn,
    showScoreDiff,
    false,
    legendScale,
  );
  if (boxScoreItems.length) {
    const boxScoreTop = legendTop + legendHeight + boxScoreGap;
    drawBoxScoreTable(ctx, computed, boxScoreItems, boxScoreX, boxScoreTop, boxScoreWidth);
  }
  drawWatermark(ctx, computed, 6, contentHeight - 6);

  return canvas;
};
