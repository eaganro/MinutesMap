import {
  getPeriodDurationSeconds,
  getPeriodStartSeconds,
  getSecondsElapsed,
} from '../../../../helpers/playTimeline';
import {
  BOX_TABLE_HEADER_HEIGHT,
  BOX_TABLE_ROW_HEIGHT,
  DESKTOP_EXPORT_WIDTH,
  STACKED_BOX_SCORE_WEIGHTS,
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
  drawPlayerFocusHeader,
  drawRowMarkers,
  filterRenderableActions,
  getExportComputedStyle,
  measureCaptionBlockHeight,
  measureCenteredScoreHeaderHeight,
  measurePlayerFocusHeaderHeight,
  getScoreTimelineSource,
} from './renderSharedPrimitives';

export const renderPlayerStackedExportCanvas = ({
  exportWidth,
  legendShouldWrap,
  periodRange,
  rightMargin,
  playRef,
  gameDate,
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
  statOn,
  showScoreDiff,
  selectedPlayer,
  playerDisplayName,
}) => {
  const contentWidth = exportWidth || DESKTOP_EXPORT_WIDTH;
  const outerPadding = 12;
  const rightPad = rightMargin;
  const topPadding = 8;
  const quarterLabelHeight = 16;
  const rowHeight = 32;
  const sectionGap = 10;
  const periodCount = getPeriodCountFromRange(periodRange);
  const bottomPadding = getQuarterAwareLegendGap(periodCount, 22, 28);

  const rangeStart = Number(periodRange?.start);
  const rangeEnd = Number(periodRange?.end);
  const periods =
    Number.isFinite(rangeStart) && Number.isFinite(rangeEnd) && rangeEnd >= rangeStart
      ? Array.from({ length: rangeEnd - rangeStart + 1 }, (_, idx) => rangeStart + idx)
      : [];

  const sectionHeight = quarterLabelHeight + rowHeight;
  const playAreaHeight =
    topPadding +
    periods.length * sectionHeight +
    Math.max(0, periods.length - 1) * sectionGap +
    bottomPadding;
  const legendGap = 0;
  const computed = getExportComputedStyle(playRef);
  if (!computed) return null;

  const hasPlayer = Boolean(selectedPlayer?.name);
  const isAway =
    hasPlayer && (selectedPlayer?.teamKey === 'away' || selectedPlayer?.team === 'away');
  const teamKey = hasPlayer ? (isAway ? 'away' : 'home') : null;
  const playerName = selectedPlayer?.name || '';
  const playerLabel = playerDisplayName || playerName;
  const playerTeamAbbr = hasPlayer
    ? isAway
      ? displayAwayTeamNames?.abr || 'Away'
      : displayHomeTeamNames?.abr || 'Home'
    : '';

  const legendScale = getQuarterAwareLegendScale(periodCount);
  const legendForceWrapAfterGroupIndex = 1;
  const legendMeasureCtx = document.createElement('canvas').getContext('2d');
  const playerFocusHeight = measurePlayerFocusHeaderHeight({
    playerLabel,
    teamAbbr: playerTeamAbbr,
  });
  const legendHeight = measureLegendHeight(
    legendMeasureCtx,
    computed,
    contentWidth - 24,
    legendShouldWrap,
    statOn,
    showScoreDiff,
    false,
    legendScale,
    legendForceWrapAfterGroupIndex,
  );
  const captionHeight = measureCaptionBlockHeight({
    measureCtx: legendMeasureCtx,
    text: captionText,
    maxWidth: contentWidth - 24,
  });
  const playerFocusTopGap = 0;
  const playerFocusBottomGap = playerFocusHeight > 0 ? 6 : 0;
  const captionTopGap = captionHeight > 0 ? (playerFocusHeight > 0 ? 4 : 6) : 0;
  const captionBottomGap = captionHeight > 0 ? 8 : 0;
  const headerHeight = measureCenteredScoreHeaderHeight({ gameDate, statusLabel });
  const scoreHeaderY = playerFocusTopGap + playerFocusHeight + playerFocusBottomGap;
  const playAreaTop =
    playerFocusTopGap +
    playerFocusHeight +
    playerFocusBottomGap +
    headerHeight +
    captionTopGap +
    captionHeight +
    captionBottomGap;
  const chartTop = playAreaTop;
  const chartLeft = rightPad;
  const chartWidth = Math.max(1, contentWidth - chartLeft - rightPad);
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
  const boxScoreGap = boxScoreItems.length ? 12 : 0;
  const boxScoreWidth = contentWidth;
  const boxScoreX = Math.max(0, (contentWidth - boxScoreWidth) / 2);
  const boxScoreHeight = boxScoreItems.length ? BOX_TABLE_HEADER_HEIGHT + BOX_TABLE_ROW_HEIGHT : 0;
  const boxScoreBottomPadding = boxScoreItems.length ? 26 : 16;
  const contentHeight =
    playAreaTop +
    playAreaHeight +
    legendGap +
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
    gameDate,
    scoreTimelineSource,
    statusLabel,
    textPrimary,
    textSecondary,
    teamLogos,
    y: scoreHeaderY,
  });
  if (playerFocusHeight > 0) {
    drawPlayerFocusHeader({
      ctx,
      contentWidth,
      y: playerFocusTopGap,
      playerLabel,
      teamAbbr: playerTeamAbbr,
      textPrimary,
      textSecondary,
    });
  }
  if (captionHeight > 0) {
    drawCaptionBlock({
      ctx,
      text: captionText,
      x: 12,
      y: scoreHeaderY + headerHeight + captionTopGap,
      maxWidth: contentWidth - 24,
      color: textSecondary,
      textAlign: 'center',
    });
  }

  const sectionTop = chartTop + topPadding;

  const filteredActions = filterRenderableActions(actions);
  const markerLookups = buildMarkerLookups(filteredActions);
  const iconSize = Math.max(3, Math.min(5, rowHeight * 0.35)) * TIMELINE_ICON_SCALE;

  ctx.textBaseline = 'middle';

  periods.forEach((period, index) => {
    const blockTop = sectionTop + 6 + index * (sectionHeight + sectionGap);
    const label = formatPeriodLabel(period);
    if (label) {
      ctx.fillStyle = quarterLabelColor;
      ctx.font = '600 10px system-ui, -apple-system, sans-serif';
      ctx.textBaseline = 'top';
      const labelWidth = ctx.measureText(label).width;
      ctx.fillText(label, chartLeft + (chartWidth - labelWidth) / 2, blockTop);
    }

    const rowTop = blockTop + quarterLabelHeight;
    const centerY = rowTop + rowHeight / 2;
    ctx.textBaseline = 'middle';

    const windowStartSeconds = getPeriodStartSeconds(period);
    const windowDurationSeconds = getPeriodDurationSeconds(period);
    const baseDurationSeconds = getPeriodDurationSeconds(1) || windowDurationSeconds || 1;
    const durationRatio =
      windowDurationSeconds > 0 ? windowDurationSeconds / baseDurationSeconds : 1;
    const rowWidth = Math.max(1, Math.min(chartWidth, chartWidth * durationRatio));
    const rowLeft = chartLeft + (chartWidth - rowWidth);
    const rowRight = rowLeft + rowWidth;
    const getXForSeconds = (seconds) => {
      if (windowDurationSeconds <= 0) return chartLeft;
      const ratio = (seconds - windowStartSeconds) / windowDurationSeconds;
      return rowLeft + Math.max(0, Math.min(rowWidth, ratio * rowWidth));
    };
    const getXForTime = (periodValue, clock) => {
      const elapsed = getSecondsElapsed(periodValue, clock);
      return getXForSeconds(elapsed);
    };

    drawPeriodCaps(ctx, rowLeft, rowRight, centerY, lineLight);

    ctx.strokeStyle = lineLight;
    ctx.lineWidth = 1;
    timeline
      .filter((entry) => Number(entry?.period) === period)
      .forEach((entry) => {
        if (!entry?.end) return;
        const x1 = getXForTime(entry.period, entry.start);
        const x2 = getXForTime(entry.period, entry.end);
        ctx.beginPath();
        ctx.moveTo(x1, centerY);
        ctx.lineTo(x2, centerY);
        ctx.stroke();
      });

    const periodActions = filteredActions.filter((action) => Number(action?.period) === period);
    drawRowMarkers({
      ctx,
      actions: periodActions,
      markerLookups,
      getXForAction: (action) => getXForTime(action.period, action.clock),
      centerY,
      size: iconSize,
      computedStyle: computed,
    });
  });

  const legendTop = playAreaTop + playAreaHeight + legendGap;
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
    legendForceWrapAfterGroupIndex,
  );
  if (boxScoreItems.length) {
    const boxScoreTop = legendTop + legendHeight + boxScoreGap;
    drawBoxScoreTable(ctx, computed, boxScoreItems, boxScoreX, boxScoreTop, boxScoreWidth, {
      statWeights: STACKED_BOX_SCORE_WEIGHTS,
    });
  }
  drawWatermark(ctx, computed, 6, contentHeight - 6);

  return canvas;
};
