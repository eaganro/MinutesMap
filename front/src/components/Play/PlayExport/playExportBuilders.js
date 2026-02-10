import {
  getPeriodDurationSeconds,
  getPeriodStartSeconds,
  getSecondsElapsed,
} from '../../../helpers/playTimeline';
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
  drawStepScoreDiff,
  drawWatermark,
  formatPeriodLabel,
  getCssVar,
  getFullTimelineLegendScale,
  getPeriodCountFromRange,
  getQuarterAwareLegendGap,
  getQuarterAwareLegendScale,
  measureLegendHeight,
  truncateText,
} from './playExportCore';
import {
  buildMarkerLookups,
  createExportCanvasContext,
  drawCommonHeaderMeta,
  drawFittedHeaderText,
  drawRowMarkers,
  filterRenderableActions,
  getExportComputedStyle,
  getScoreTimelineSource,
} from './playExportBuilders.shared';

const buildLiteExportCanvas = ({
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

const buildSinglePlayerExportCanvas = ({
  exportWidth,
  legendShouldWrap,
  rangeLabel,
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
  const headerHeight = 60;
  const playAreaTop = headerHeight + 8;
  const topPadding = 8;
  const teamLabelHeight = 0;
  const rowHeight = 48;
  const periodCount = getPeriodCountFromRange(periodRange);
  const bottomPadding = getQuarterAwareLegendGap(periodCount, 6, 12);
  const playAreaHeight = topPadding + teamLabelHeight + 4 + rowHeight + bottomPadding;
  const chartTop = playAreaTop;
  const chartLeft = rightPad;
  const chartWidth = Math.max(1, contentWidth - chartLeft - rightPad);
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

  const { formattedGameDate } = drawCommonHeaderMeta({
    ctx,
    contentWidth,
    rightPad,
    awayLabel,
    homeLabel,
    rangeLabel,
    gameDate,
    scoreTimelineSource,
    statusLabel,
    textPrimary,
    textSecondary,
  });

  const displayName = playerLabel || 'Select a player';
  const playerNameMaxWidth = Math.max(0, contentWidth - rightPad - 12);
  const playerNameY = formattedGameDate ? 54 : 38;
  drawFittedHeaderText({
    ctx,
    text: displayName,
    x: 6,
    y: playerNameY,
    maxWidth: playerNameMaxWidth,
    color: textPrimary,
  });

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

const buildSinglePlayerStackedExportCanvas = ({
  exportWidth,
  legendShouldWrap,
  rangeLabel,
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
  statusLabel,
  statOn,
  showScoreDiff,
  selectedPlayer,
  playerDisplayName,
}) => {
  const contentWidth = exportWidth || DESKTOP_EXPORT_WIDTH;
  const outerPadding = 12;
  const rightPad = rightMargin;
  const headerHeight = 60;
  const playAreaTop = headerHeight + 8;
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
  const chartTop = playAreaTop;
  const chartLeft = rightPad;
  const chartWidth = Math.max(1, contentWidth - chartLeft - rightPad);
  const legendGap = 0;
  const computed = getExportComputedStyle(playRef);
  if (!computed) return null;

  const legendScale = getQuarterAwareLegendScale(periodCount);
  const legendForceWrapAfterGroupIndex = 1;
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
    legendForceWrapAfterGroupIndex,
  );

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
  const boxScoreItems = buildBoxScoreColumns(boxScoreStats, playerName, true);
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

  const { formattedGameDate } = drawCommonHeaderMeta({
    ctx,
    contentWidth,
    rightPad,
    awayLabel,
    homeLabel,
    rangeLabel,
    gameDate,
    scoreTimelineSource,
    statusLabel,
    textPrimary,
    textSecondary,
  });

  const displayName = playerLabel || 'Select a player';
  const playerNameMaxWidth = Math.max(0, contentWidth - rightPad - 12);
  const playerNameY = formattedGameDate ? 54 : 38;
  drawFittedHeaderText({
    ctx,
    text: displayName,
    x: 6,
    y: playerNameY,
    maxWidth: playerNameMaxWidth,
    color: textPrimary,
  });

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

const buildFullExportCanvas = ({
  exportWidth,
  legendShouldWrap,
  rangeLabel,
  periodRange,
  leftMargin,
  rightMargin,
  playRef,
  gameDate,
  displayAwayTeamNames,
  displayHomeTeamNames,
  filteredAwayPlayers,
  filteredHomePlayers,
  filteredAwayPlayerTimeline,
  filteredHomePlayerTimeline,
  filteredScoreTimeline,
  displayScoreTimeline,
  endAtLastScore,
  endAtSeconds,
  statusLabel,
  startScoreDiff,
  timelineWindow,
  maxY,
  maxLead,
  showScoreDiff,
  statOn,
  teamColors,
  awayColor,
  homeColor,
}) => {
  const contentWidth = exportWidth || DESKTOP_EXPORT_WIDTH;
  const outerPadding = 12;
  const leftPad = leftMargin;
  const rightPad = rightMargin;
  const headerHeight = 44;
  const playAreaTop = headerHeight + 8;
  const teamLabelHeight = 18;
  const teamSectionHeight = 275;
  const playAreaHeight = 600;
  const computed = getExportComputedStyle(playRef);
  if (!computed) return null;

  const periodCount = getPeriodCountFromRange(periodRange);
  const legendScale = getFullTimelineLegendScale(periodCount);
  const legendTopGap = getQuarterAwareLegendGap(periodCount, 5, 10);
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

  const chartHeight = playAreaHeight;
  const chartTop = playAreaTop;
  const chartLeft = leftPad;
  const chartWidth = Math.max(1, contentWidth - chartLeft - rightPad);

  const awayNames = Object.keys(filteredAwayPlayers || {});
  const homeNames = Object.keys(filteredHomePlayers || {});
  const awayRowHeight = teamSectionHeight / Math.max(1, awayNames.length);
  const homeRowHeight = teamSectionHeight / Math.max(1, homeNames.length);

  const watermarkBottomPadding = 24;
  const contentHeight =
    playAreaTop + playAreaHeight + legendTopGap + legendHeight + watermarkBottomPadding;

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

  drawCommonHeaderMeta({
    ctx,
    contentWidth,
    rightPad,
    awayLabel,
    homeLabel,
    rangeLabel,
    gameDate,
    scoreTimelineSource,
    statusLabel,
    textPrimary,
    textSecondary,
  });

  const baselineY = chartTop + chartHeight / 2;
  ctx.strokeStyle = lineColor;
  ctx.beginPath();
  ctx.moveTo(chartLeft, baselineY);
  ctx.lineTo(chartLeft + chartWidth, baselineY);
  ctx.stroke();

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

  if (showScoreDiff && maxLead > 0) {
    let numLines = 0;
    let lineJump = 0;
    if (maxLead / 5 < 5) {
      numLines = Math.floor(maxLead / 5);
      lineJump = 5;
    } else if (maxLead / 10 < 5) {
      numLines = Math.floor(maxLead / 10);
      lineJump = 10;
    } else if (maxLead / 15 < 5) {
      numLines = Math.floor(maxLead / 15);
      lineJump = 15;
    } else {
      numLines = Math.floor(maxLead / 20);
      lineJump = 20;
    }
    const drawDiffLabel = (value, y, color) => {
      const text = `${value}`;
      ctx.fillStyle = color;
      const x = chartLeft + chartWidth + 4;
      ctx.fillText(text, x, y + 3);
    };
    ctx.setLineDash([5, 18]);
    ctx.lineWidth = 1;
    for (let i = 0; i < numLines; i += 1) {
      const value = (i + 1) * lineJump;
      const yOffset = (value * (chartHeight / 2)) / maxY;
      const posy = baselineY - yOffset;
      const negy = baselineY + yOffset;

      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = teamColors.away;
      ctx.beginPath();
      ctx.moveTo(chartLeft, posy);
      ctx.lineTo(chartLeft + chartWidth, posy);
      ctx.stroke();
      ctx.restore();
      drawDiffLabel(value, posy, teamColors.away);

      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = teamColors.home;
      ctx.beginPath();
      ctx.moveTo(chartLeft, negy);
      ctx.lineTo(chartLeft + chartWidth, negy);
      ctx.stroke();
      ctx.restore();
      drawDiffLabel(value, negy, teamColors.home);
    }
    ctx.setLineDash([]);
  }

  if (showScoreDiff && chartWidth > 0) {
    drawStepScoreDiff({
      ctx,
      baselineY,
      chartLeft,
      chartWidth,
      chartHeight,
      maxY,
      startScoreDiff,
      timelineWindow,
      scoreTimeline: scoreTimelineSource,
      awayColor: awayColor || lineColor,
      homeColor: homeColor || lineColor,
      endAtLastScore,
      endAtSeconds,
    });
  }

  const getXForTime = (period, clock) => {
    const elapsed = getSecondsElapsed(period, clock);
    return getXForSeconds(elapsed);
  };

  const drawTeamSection = (teamLabel, teamColor, names, players, timelines, startY, rowHeight) => {
    ctx.fillStyle = teamColor || textPrimary;
    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(teamLabel, 6, startY);

    const nameAreaWidth = Math.max(40, chartLeft - 12);
    let rowTop = startY + teamLabelHeight + 4;
    ctx.textBaseline = 'middle';
    names.forEach((name) => {
      const centerY = rowTop + rowHeight / 2;
      const fontSize = Math.max(9, Math.min(12, rowHeight * 0.6));
      ctx.font = `500 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = lineLight;
      const clippedName = truncateText(ctx, name, nameAreaWidth);
      ctx.fillText(clippedName, 6, centerY);

      const timeline = timelines?.[name] || [];
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

      const actions = filterRenderableActions(players?.[name] || []);
      const markerLookups = buildMarkerLookups(actions);
      const size = Math.max(3, Math.min(5, rowHeight * 0.28)) * TIMELINE_ICON_SCALE;
      drawRowMarkers({
        ctx,
        actions,
        markerLookups,
        getXForAction: (action) => getXForTime(action.period, action.clock),
        centerY,
        size,
        computedStyle: computed,
      });

      rowTop += rowHeight;
    });
    return rowTop;
  };

  let cursorY = playAreaTop + 4;
  cursorY = drawTeamSection(
    displayAwayTeamNames?.name || awayLabel,
    teamColors.away,
    awayNames,
    filteredAwayPlayers,
    filteredAwayPlayerTimeline,
    cursorY,
    awayRowHeight,
  );

  drawTeamSection(
    displayHomeTeamNames?.name || homeLabel,
    teamColors.home,
    homeNames,
    filteredHomePlayers,
    filteredHomePlayerTimeline,
    cursorY,
    homeRowHeight,
  );

  const legendTop = playAreaTop + playAreaHeight + legendTopGap;
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

export const buildPlayExportCanvas = (params) => {
  if (params?.exportView === 'player') {
    return buildSinglePlayerExportCanvas(params);
  }
  if (params?.exportView === 'player-stacked') {
    return buildSinglePlayerStackedExportCanvas(params);
  }
  return buildFullExportCanvas(params) || buildLiteExportCanvas(params);
};
