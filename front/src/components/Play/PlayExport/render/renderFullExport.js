import {
  getPeriodDurationSeconds,
  getPeriodStartSeconds,
  getSecondsElapsed,
} from '../../../../helpers/playTimeline';
import {
  DESKTOP_EXPORT_WIDTH,
  TIMELINE_ICON_SCALE,
  drawLegend,
  drawStepScoreDiff,
  drawWatermark,
  formatPeriodLabel,
  getCssVar,
  getFullTimelineLegendScale,
  getPeriodCountFromRange,
  getQuarterAwareLegendGap,
  measureLegendHeight,
  truncateText,
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

const clampProb = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(1, parsed));
};

const drawOddsOverlay = ({
  ctx,
  chartLeft,
  chartTop,
  chartWidth,
  chartHeight,
  timelineWindow,
  oddsTimeline,
  startOddsProb,
  lastAction,
  color,
}) => {
  if (!ctx || !chartWidth) return;
  const windowStartSeconds = timelineWindow?.startSeconds ?? 0;
  const windowDurationSeconds = timelineWindow?.durationSeconds ?? 0;
  if (windowDurationSeconds <= 0) return;

  const getXForEntry = (entry) => {
    const elapsed = getSecondsElapsed(entry.period, entry.clock);
    const ratio = (elapsed - windowStartSeconds) / windowDurationSeconds;
    return chartLeft + Math.max(0, Math.min(chartWidth, ratio * chartWidth));
  };
  const probToY = (awayWinProb) => chartTop + (1 - awayWinProb) * chartHeight;

  const timeline = (oddsTimeline || []).filter((entry) => clampProb(entry?.awayWinProb) !== null);
  let currentProb = clampProb(startOddsProb);
  let currentX = chartLeft;

  if (currentProb === null && timeline.length) {
    currentProb = clampProb(timeline[0]?.awayWinProb);
    currentX = getXForEntry(timeline[0]);
  }
  if (currentProb === null) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(currentX, probToY(currentProb));

  timeline.forEach((entry) => {
    const nextProb = clampProb(entry?.awayWinProb);
    if (nextProb === null) return;
    const nextX = getXForEntry(entry);
    ctx.lineTo(nextX, probToY(currentProb));
    ctx.lineTo(nextX, probToY(nextProb));
    currentX = nextX;
    currentProb = nextProb;
  });

  const finalX = lastAction ? Math.max(currentX, getXForEntry(lastAction)) : chartLeft + chartWidth;
  ctx.lineTo(finalX, probToY(currentProb));
  ctx.stroke();
  ctx.restore();
};

export const renderFullExportCanvas = ({
  exportWidth,
  legendShouldWrap,
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
  filteredOddsTimeline,
  displayScoreTimeline,
  captionText,
  teamLogos,
  endAtLastScore,
  endAtSeconds,
  statusLabel,
  startScoreDiff,
  startOddsProb,
  timelineWindow,
  maxY,
  maxLead,
  showScoreDiff,
  showOdds,
  statOn,
  teamColors,
  awayColor,
  homeColor,
}) => {
  const contentWidth = exportWidth || DESKTOP_EXPORT_WIDTH;
  const outerPadding = 12;
  const leftPad = leftMargin;
  const rightPad = rightMargin;
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
    showOdds,
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
  const headerHeight = measureCenteredScoreHeaderHeight({ gameDate, statusLabel });
  const playAreaTop = headerHeight + captionTopGap + captionHeight + captionBottomGap;

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
  const oddsLineColor = getCssVar(computed, '--odds-line-color', '#0f766e');
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

  if (showOdds && chartWidth > 0) {
    drawOddsOverlay({
      ctx,
      chartLeft,
      chartTop,
      chartWidth,
      chartHeight,
      timelineWindow,
      oddsTimeline: filteredOddsTimeline,
      startOddsProb,
      lastAction: filteredScoreTimeline?.length
        ? filteredScoreTimeline[filteredScoreTimeline.length - 1]
        : null,
      color: oddsLineColor,
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
    showOdds,
    true,
    legendScale,
  );
  drawWatermark(ctx, computed, 6, contentHeight - 6);

  return canvas;
};
