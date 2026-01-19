import { getSecondsElapsed } from '../../helpers/playTimeline';
import { EVENT_TYPES, getEventType, isFreeThrowAction } from '../../helpers/eventStyles.jsx';

export const DESKTOP_EXPORT_WIDTH = 1235;
export const MOBILE_EXPORT_MAX_WIDTH = 1024;

const sanitizeFilePart = (value) => (
  String(value || '')
    .trim()
    .replace(/[^a-z0-9-_]+/gi, '_')
    .replace(/^_+|_+$/g, '')
);

const isTransparentColor = (value) => (
  value === 'transparent' || value === 'rgba(0, 0, 0, 0)'
);

const resolveExportBackground = (element) => {
  let current = element;
  while (current && current.nodeType === 1) {
    const bg = window.getComputedStyle(current).backgroundColor;
    if (bg && !isTransparentColor(bg)) {
      return bg;
    }
    current = current.parentElement;
  }
  return '#ffffff';
};

export const buildPlayExportFileName = ({
  awayTeamNames,
  homeTeamNames,
  isQuarterFocus,
  activePeriodLabel,
  activePeriod,
  gameId
}) => {
  const away = awayTeamNames?.abr || 'Away';
  const home = homeTeamNames?.abr || 'Home';
  const periodLabel = isQuarterFocus
    ? (activePeriodLabel || `P${activePeriod}`)
    : 'Game';
  const base = `${away}-vs-${home}-${periodLabel}`;
  const safeBase = sanitizeFilePart(base) || 'play-by-play';
  const suffix = gameId ? `-${sanitizeFilePart(gameId)}` : '';
  return `${safeBase}${suffix}.png`;
};

export const dataUrlToBlob = (dataUrl) => {
  if (!dataUrl) return null;
  if (typeof atob === 'undefined') return null;
  const parts = dataUrl.split(',');
  if (parts.length < 2) return null;
  const header = parts[0];
  const data = parts[1];
  const match = header.match(/data:(.*?);base64/);
  const mime = match ? match[1] : 'image/png';
  const binary = atob(data);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    buffer[i] = binary.charCodeAt(i);
  }
  return new Blob([buffer], { type: mime });
};

export const canvasToBlob = (canvas) => {
  if (!canvas) return Promise.resolve(null);
  if (canvas.toBlob) {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }
  try {
    return Promise.resolve(dataUrlToBlob(canvas.toDataURL('image/png')));
  } catch (err) {
    return Promise.resolve(null);
  }
};

const getCssVar = (computedStyle, varName, fallback) => {
  if (!computedStyle) return fallback;
  const value = computedStyle.getPropertyValue(varName);
  return value ? value.trim() : fallback;
};

const truncateText = (ctx, text, maxWidth) => {
  if (!ctx || !text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed && ctx.measureText(`${trimmed}...`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed ? `${trimmed}...` : text;
};

const FREE_THROW_PATTERN = /free throw\s+(\d+)\s+of\s+(\d+)/i;

const getFreeThrowAttempt = (description, subType) => {
  const text = `${subType || ''} ${description || ''}`;
  const match = text.match(FREE_THROW_PATTERN);
  if (!match) {
    return { attempt: 1, total: 1 };
  }
  return { attempt: Number(match[1]), total: Number(match[2]) };
};

const getFreeThrowRingRatio = (attempt, total) => {
  if (total <= 1) return 0.8;
  if (attempt === 1) return 0.6;
  if (attempt === 2) return 0.8;
  return 1.1;
};

const drawPolygon = (ctx, points) => {
  if (!ctx || !points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.fill();
};

const drawEventShape = (ctx, eventType, cx, cy, size, computedStyle, is3PT) => {
  const config = EVENT_TYPES[eventType];
  if (!config) return;
  const color = getCssVar(computedStyle, config.colorVar, config.fallback);
  const markerColor = getCssVar(computedStyle, '--event-3pt-marker', '#DC2626');
  ctx.fillStyle = color;
  ctx.strokeStyle = color;

  switch (config.shape) {
    case 'circle': {
      ctx.beginPath();
      ctx.arc(cx, cy, size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'cross': {
      ctx.lineWidth = Math.max(1, size * 0.6);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - size, cy - size);
      ctx.lineTo(cx + size, cy + size);
      ctx.moveTo(cx + size, cy - size);
      ctx.lineTo(cx - size, cy + size);
      ctx.stroke();
      break;
    }
    case 'diamond': {
      drawPolygon(ctx, [
        { x: cx, y: cy - size },
        { x: cx + size, y: cy },
        { x: cx, y: cy + size },
        { x: cx - size, y: cy }
      ]);
      break;
    }
    case 'chevron': {
      drawPolygon(ctx, [
        { x: cx - size * 0.6, y: cy - size },
        { x: cx + size, y: cy },
        { x: cx - size * 0.6, y: cy + size }
      ]);
      break;
    }
    case 'triangleDown': {
      drawPolygon(ctx, [
        { x: cx, y: cy + size },
        { x: cx - size, y: cy - size * 0.7 },
        { x: cx + size, y: cy - size * 0.7 }
      ]);
      break;
    }
    case 'triangleUp': {
      drawPolygon(ctx, [
        { x: cx, y: cy - size },
        { x: cx - size, y: cy + size * 0.7 },
        { x: cx + size, y: cy + size * 0.7 }
      ]);
      break;
    }
    case 'square': {
      const edge = size * 1.6;
      ctx.fillRect(cx - edge / 2, cy - edge / 2, edge, edge);
      break;
    }
    case 'hexagon': {
      const points = [];
      for (let i = 0; i < 6; i += 1) {
        const angle = (i * 60 - 90) * (Math.PI / 180);
        points.push({ x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) });
      }
      drawPolygon(ctx, points);
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(cx, cy, size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }

  if (is3PT) {
    ctx.fillStyle = markerColor;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawFreeThrowRing = (ctx, cx, cy, size, description, subType, computedStyle) => {
  if (!ctx) return;
  const desc = (description || '').toString().toLowerCase();
  const isMiss = desc.includes('miss');
  const { attempt, total } = getFreeThrowAttempt(description, subType);
  const ringRatio = getFreeThrowRingRatio(attempt, total);
  const ringRadius = size * ringRatio;
  const ringColor = isMiss
    ? getCssVar(computedStyle, '--event-miss', '#475569')
    : getCssVar(computedStyle, '--event-point', '#F59E0B');
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = Math.max(1, size * 0.3);
  ctx.beginPath();
  ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
  ctx.stroke();
};

const drawFreeThrowLegendRing = (ctx, cx, cy, size, computedStyle, isMiss) => {
  if (!ctx) return;
  const ringColor = isMiss
    ? getCssVar(computedStyle, '--event-miss', '#475569')
    : getCssVar(computedStyle, '--event-point', '#F59E0B');
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = Math.max(1, size * 0.35);
  ctx.beginPath();
  ctx.arc(cx, cy, size, 0, Math.PI * 2);
  ctx.stroke();
};

const drawScoreLeadIcon = (ctx, cx, cy, size, computedStyle) => {
  if (!ctx) return;
  const color = getCssVar(computedStyle, '--text-secondary', '#6b7280');
  const left = cx - size;
  const top = cy - size;
  const width = size * 2;
  const height = size * 2;
  const px = (value) => left + value * width;
  const py = (value) => top + value * height;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, size * 0.2);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(px(0.05), py(0.55));
  ctx.lineTo(px(0.28), py(0.3));
  ctx.lineTo(px(0.5), py(0.55));
  ctx.lineTo(px(0.73), py(0.2));
  ctx.lineTo(px(0.95), py(0.42));
  ctx.stroke();

  ctx.globalAlpha = 0.3;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(px(0.05), py(0.55));
  ctx.lineTo(px(0.28), py(0.3));
  ctx.lineTo(px(0.5), py(0.55));
  ctx.lineTo(px(0.73), py(0.2));
  ctx.lineTo(px(0.95), py(0.42));
  ctx.lineTo(px(0.95), py(0.9));
  ctx.lineTo(px(0.05), py(0.9));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const drawLegend = (ctx, computedStyle, startX, startY, maxWidth, allowWrap = false) => {
  if (!ctx) return startY;
  const rowHeight = 18;
  const rowGap = 8;
  const textColor = getCssVar(computedStyle, '--text-secondary', '#6b7280');
  ctx.textBaseline = 'middle';

  const buildRow = ({ iconSize, fontSize, itemGap, groupGap }) => {
    const iconBox = iconSize * 2;
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;

    const createItem = (label, drawIcon) => {
      const labelWidth = ctx.measureText(label).width;
      return {
        label,
        drawIcon,
        width: iconBox + 4 + labelWidth,
      };
    };

    const buildGroup = (items) => {
      const total = items.reduce((sum, item) => sum + item.width, 0);
      return {
        items,
        width: total + itemGap * Math.max(0, items.length - 1),
      };
    };

    const drawGroup = (group, x, y) => {
      let cursor = x;
      group.items.forEach((item) => {
        item.drawIcon(cursor + iconSize, y - 1);
        ctx.fillStyle = textColor;
        ctx.fillText(item.label, cursor + iconBox + 4, y + 1);
        cursor += item.width + itemGap;
      });
    };

    const pointGroup = buildGroup([
      createItem('2PT', (cx, cy) => drawEventShape(ctx, 'point', cx, cy, iconSize, computedStyle, false)),
      createItem('3PT', (cx, cy) => drawEventShape(ctx, 'point', cx, cy, iconSize, computedStyle, true)),
      createItem('FT', (cx, cy) => drawFreeThrowLegendRing(ctx, cx, cy, iconSize * 0.95, computedStyle, false)),
    ]);
    const missGroup = buildGroup([
      createItem('Miss', (cx, cy) => drawEventShape(ctx, 'miss', cx, cy, iconSize, computedStyle, false)),
      createItem('3PT', (cx, cy) => drawEventShape(ctx, 'miss', cx, cy, iconSize, computedStyle, true)),
      createItem('FT', (cx, cy) => drawFreeThrowLegendRing(ctx, cx, cy, iconSize * 0.95, computedStyle, true)),
    ]);
    const reboundGroup = buildGroup([
      createItem('Rebound', (cx, cy) => drawEventShape(ctx, 'rebound', cx, cy, iconSize, computedStyle, false)),
    ]);
    const assistGroup = buildGroup([
      createItem('Assist', (cx, cy) => drawEventShape(ctx, 'assist', cx, cy, iconSize, computedStyle, false)),
    ]);
    const turnoverGroup = buildGroup([
      createItem('Turnover', (cx, cy) => drawEventShape(ctx, 'turnover', cx, cy, iconSize, computedStyle, false)),
    ]);
    const blockGroup = buildGroup([
      createItem('Block', (cx, cy) => drawEventShape(ctx, 'block', cx, cy, iconSize, computedStyle, false)),
    ]);
    const stealGroup = buildGroup([
      createItem('Steal', (cx, cy) => drawEventShape(ctx, 'steal', cx, cy, iconSize, computedStyle, false)),
    ]);
    const foulGroup = buildGroup([
      createItem('Foul', (cx, cy) => drawEventShape(ctx, 'foul', cx, cy, iconSize, computedStyle, false)),
    ]);
    const scoreLeadGroup = buildGroup([
      createItem('Score Lead', (cx, cy) => drawScoreLeadIcon(ctx, cx, cy, iconSize, computedStyle)),
    ]);

    const groups = [
      pointGroup,
      missGroup,
      reboundGroup,
      assistGroup,
      turnoverGroup,
      blockGroup,
      stealGroup,
      foulGroup,
      scoreLeadGroup
    ];

    const rowWidth = groups.reduce((sum, group) => sum + group.width, 0)
      + groupGap * Math.max(0, groups.length - 1);

    return { groups, rowWidth, drawGroup, groupGap };
  };

  let rowConfig = buildRow({
    iconSize: 6,
    fontSize: 11,
    itemGap: 10,
    groupGap: 16
  });
  if (rowConfig.rowWidth > maxWidth && !allowWrap) {
    rowConfig = buildRow({
      iconSize: 5,
      fontSize: 10,
      itemGap: 8,
      groupGap: 12
    });
  }

  const rowY = startY + rowHeight / 2;

  if (allowWrap) {
    const rows = [[]];
    const rowWidths = [0];
    rowConfig.groups.forEach((group) => {
      const rowIndex = rows.length - 1;
      const addWidth = group.width + (rows[rowIndex].length ? rowConfig.groupGap : 0);
      if (rows[rowIndex].length && rowWidths[rowIndex] + addWidth > maxWidth) {
        rows.push([group]);
        rowWidths.push(group.width);
      } else {
        rows[rowIndex].push(group);
        rowWidths[rowIndex] += addWidth;
      }
    });

    rows.forEach((row, index) => {
      const width = rowWidths[index];
      const rowStart = startX + Math.max(0, (maxWidth - width) / 2);
      let cursor = rowStart;
      const y = rowY + index * (rowHeight + rowGap);
      row.forEach((group, groupIndex) => {
        rowConfig.drawGroup(group, cursor, y);
        cursor += group.width + (groupIndex < row.length - 1 ? rowConfig.groupGap : 0);
      });
    });

    return rowY + (rows.length - 1) * (rowHeight + rowGap) + rowHeight / 2;
  }

  const rowStart = startX + Math.max(0, (maxWidth - rowConfig.rowWidth) / 2);
  const scale = rowConfig.rowWidth > maxWidth ? maxWidth / rowConfig.rowWidth : 1;

  ctx.save();
  if (scale !== 1) {
    ctx.translate(rowStart, 0);
    ctx.scale(scale, 1);
    let cursor = 0;
    rowConfig.groups.forEach((group, index) => {
      rowConfig.drawGroup(group, cursor, rowY);
      cursor += group.width + (index < rowConfig.groups.length - 1 ? rowConfig.groupGap : 0);
    });
  } else {
    let cursor = rowStart;
    rowConfig.groups.forEach((group, index) => {
      rowConfig.drawGroup(group, cursor, rowY);
      cursor += group.width + (index < rowConfig.groups.length - 1 ? rowConfig.groupGap : 0);
    });
  }
  ctx.restore();

  return rowY + rowHeight / 2;
};

const drawStepScoreDiff = ({
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

  drawSegment(endX);
};

const buildLiteExportCanvas = ({
  exportWidth,
  isQuarterFocus,
  activePeriodLabel,
  leftMargin,
  rightMargin,
  playRef,
  displayAwayTeamNames,
  displayHomeTeamNames,
  filteredScoreTimeline,
  displayScoreTimeline,
  startScoreDiff,
  timelineWindow,
  maxY,
  showScoreDiff,
  awayColor,
  homeColor,
}) => {
  if (typeof window === 'undefined') return null;
  const contentWidth = exportWidth || DESKTOP_EXPORT_WIDTH;
  const outerPadding = 12;
  const baseWidth = contentWidth + outerPadding * 2;
  const leftPad = leftMargin;
  const rightPad = rightMargin;
  const headerHeight = 54;
  const footerHeight = 32;
  const legendHeight = isQuarterFocus ? 72 : 44;
  const chartHeight = 360;
  const chartTop = headerHeight + 8;
  const chartLeft = leftPad;
  const chartWidth = Math.max(1, contentWidth - chartLeft - rightPad);
  const contentHeight = chartTop + chartHeight + footerHeight + legendHeight;
  const baseHeight = contentHeight + outerPadding * 2;
  const scale = Math.min(2, window.devicePixelRatio || 1);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(baseWidth * scale);
  canvas.height = Math.round(baseHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);

  const backgroundColor = resolveExportBackground(playRef?.current);
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, baseWidth, baseHeight);
  ctx.translate(outerPadding, outerPadding);

  const styleSource = playRef?.current || document.documentElement;
  const computed = window.getComputedStyle(styleSource);
  const getVar = (name, fallback) => {
    const value = computed.getPropertyValue(name);
    return value ? value.trim() : fallback;
  };
  const textPrimary = getVar('--text-primary', '#111111');
  const textSecondary = getVar('--text-secondary', '#666666');
  const lineColor = getVar('--line-color', '#cccccc');

  const awayLabel = displayAwayTeamNames?.abr || 'Away';
  const homeLabel = displayHomeTeamNames?.abr || 'Home';

  ctx.fillStyle = textPrimary;
  ctx.font = '600 18px system-ui, -apple-system, sans-serif';
  const titleText = `${awayLabel} vs ${homeLabel}`;
  ctx.fillText(titleText, 6, 24);
  if (isQuarterFocus && activePeriodLabel) {
    const titleWidth = ctx.measureText(titleText).width;
    ctx.fillStyle = textSecondary;
    ctx.font = '600 12px system-ui, -apple-system, sans-serif';
    ctx.fillText(activePeriodLabel, 6 + titleWidth + 8, 24);
  }

  const scoreTimelineSource = (filteredScoreTimeline && filteredScoreTimeline.length)
    ? filteredScoreTimeline
    : (displayScoreTimeline || []);
  const lastScoreEntry = scoreTimelineSource.length
    ? scoreTimelineSource[scoreTimelineSource.length - 1]
    : null;
  if (lastScoreEntry) {
    const scoreText = `${awayLabel} ${lastScoreEntry.away} - ${lastScoreEntry.home} ${homeLabel}`;
    ctx.fillStyle = textPrimary;
    ctx.font = '600 14px system-ui, -apple-system, sans-serif';
    const textWidth = ctx.measureText(scoreText).width;
    ctx.fillText(scoreText, contentWidth - 20 - textWidth, 24);
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
  });

  const legendTop = chartTop + chartHeight + 12;
  drawLegend(ctx, computed, 12, legendTop, contentWidth - 24, isQuarterFocus);

  return canvas;
};

const buildFullExportCanvas = ({
  exportWidth,
  isQuarterFocus,
  activePeriodLabel,
  leftMargin,
  rightMargin,
  playRef,
  displayAwayTeamNames,
  displayHomeTeamNames,
  filteredAwayPlayers,
  filteredHomePlayers,
  filteredAwayPlayerTimeline,
  filteredHomePlayerTimeline,
  filteredScoreTimeline,
  displayScoreTimeline,
  displayNumQs,
  startScoreDiff,
  timelineWindow,
  maxY,
  maxLead,
  showScoreDiff,
  teamColors,
  awayColor,
  homeColor,
}) => {
  if (typeof window === 'undefined') return null;
  const contentWidth = exportWidth || DESKTOP_EXPORT_WIDTH;
  const outerPadding = 12;
  const baseWidth = contentWidth + outerPadding * 2;
  const leftPad = leftMargin;
  const rightPad = rightMargin;
  const headerHeight = 32;
  const playAreaTop = headerHeight + 8;
  const teamLabelHeight = 18;
  const teamSectionHeight = 275;
  const playAreaHeight = 600;
  const legendHeight = isQuarterFocus ? 72 : 44;
  const chartHeight = playAreaHeight;
  const chartTop = playAreaTop;
  const chartLeft = leftPad;
  const chartWidth = Math.max(1, contentWidth - chartLeft - rightPad);

  const awayNames = Object.keys(filteredAwayPlayers || {});
  const homeNames = Object.keys(filteredHomePlayers || {});
  const awayRowHeight = teamSectionHeight / Math.max(1, awayNames.length);
  const homeRowHeight = teamSectionHeight / Math.max(1, homeNames.length);

  const contentHeight = playAreaTop + playAreaHeight + legendHeight + 16;
  const baseHeight = contentHeight + outerPadding * 2;

  const scale = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(baseWidth * scale);
  canvas.height = Math.round(baseHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);

  const backgroundColor = resolveExportBackground(playRef?.current);
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, baseWidth, baseHeight);
  ctx.translate(outerPadding, outerPadding);

  const styleSource = playRef?.current || document.documentElement;
  const computed = window.getComputedStyle(styleSource);
  const textPrimary = getCssVar(computed, '--text-primary', '#111111');
  const textSecondary = getCssVar(computed, '--text-secondary', '#6b7280');
  const lineColor = getCssVar(computed, '--line-color', '#cbd5f5');
  const lineLight = getCssVar(computed, '--line-color-light', '#94a3b8');
  const quarterLabelColor = getCssVar(computed, '--quarter-label-color', '#6b7280');
  const awayLabel = displayAwayTeamNames?.abr || 'Away';
  const homeLabel = displayHomeTeamNames?.abr || 'Home';

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = textPrimary;
  ctx.font = '600 16px system-ui, -apple-system, sans-serif';
  const titleText = `${awayLabel} vs ${homeLabel}`;
  ctx.fillText(titleText, 6, 22);
  if (isQuarterFocus && activePeriodLabel) {
    const titleWidth = ctx.measureText(titleText).width;
    ctx.fillStyle = textSecondary;
    ctx.font = '600 12px system-ui, -apple-system, sans-serif';
    ctx.fillText(activePeriodLabel, 6 + titleWidth + 8, 22);
  }

  const scoreTimelineSource = (filteredScoreTimeline && filteredScoreTimeline.length)
    ? filteredScoreTimeline
    : (displayScoreTimeline || []);
  const lastScoreEntry = scoreTimelineSource.length
    ? scoreTimelineSource[scoreTimelineSource.length - 1]
    : null;
  if (lastScoreEntry) {
    const scoreText = `${awayLabel} ${lastScoreEntry.away} - ${lastScoreEntry.home} ${homeLabel}`;
    ctx.fillStyle = textPrimary;
    ctx.font = '600 14px system-ui, -apple-system, sans-serif';
    const textWidth = ctx.measureText(scoreText).width;
    ctx.fillText(scoreText, contentWidth - rightPad - textWidth, 22);
  }

  const baselineY = chartTop + chartHeight / 2;
  ctx.strokeStyle = lineColor;
  ctx.beginPath();
  ctx.moveTo(chartLeft, baselineY);
  ctx.lineTo(chartLeft + chartWidth, baselineY);
  ctx.stroke();

  const exportNumPeriods = Number(displayNumQs) || 0;
  const timelineBottom = playAreaTop + playAreaHeight;
  if (!isQuarterFocus && exportNumPeriods > 0) {
    const exportQWidth = exportNumPeriods > 4
      ? chartWidth * (12 / (12 * 4 + 5 * (exportNumPeriods - 4)))
      : chartWidth / 4;
    ctx.strokeStyle = lineColor;
    for (let i = 1; i <= 3; i += 1) {
      const x = chartLeft + exportQWidth * i;
      ctx.beginPath();
      ctx.moveTo(x, chartTop);
      ctx.lineTo(x, timelineBottom);
      ctx.stroke();
    }
    for (let q = 4; q < exportNumPeriods; q += 1) {
      const x = chartLeft + exportQWidth * 4 + (5 / 12) * exportQWidth * (q - 4);
      ctx.beginPath();
      ctx.moveTo(x, chartTop);
      ctx.lineTo(x, timelineBottom);
      ctx.stroke();
    }

    ctx.fillStyle = quarterLabelColor;
    ctx.font = '600 10px system-ui, -apple-system, sans-serif';
    const labelY = chartTop + 10;
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach((label, idx) => {
      const x = chartLeft + exportQWidth * (idx + 0.5);
      ctx.fillText(label, x - ctx.measureText(label).width / 2, labelY);
    });
    const otWidth = (5 / 12) * exportQWidth;
    for (let ot = 1; ot <= exportNumPeriods - 4; ot += 1) {
      const label = `O${ot}`;
      const x = chartLeft + exportQWidth * 4 + otWidth * (ot - 0.5);
      ctx.fillText(label, x - ctx.measureText(label).width / 2, labelY);
    }
  }

  if (showScoreDiff && maxLead > 0) {
    let numLines = 0;
    let lineJump = 0;
    if ((maxLead / 5) < 5) {
      numLines = Math.floor(maxLead / 5);
      lineJump = 5;
    } else if ((maxLead / 10) < 5) {
      numLines = Math.floor(maxLead / 10);
      lineJump = 10;
    } else if ((maxLead / 15) < 5) {
      numLines = Math.floor(maxLead / 15);
      lineJump = 15;
    } else {
      numLines = Math.floor(maxLead / 20);
      lineJump = 20;
    }
    const drawDiffLabel = (value, y, color) => {
      const text = `${value}`;
      ctx.fillStyle = color;
      const textWidth = ctx.measureText(text).width;
      const maxX = contentWidth - rightPad - 2 - textWidth;
      const x = Math.min(chartLeft + chartWidth + 4, maxX);
      ctx.fillText(text, x, y + 3);
    };
    ctx.setLineDash([5, 12]);
    ctx.lineWidth = 1;
    for (let i = 0; i < numLines; i += 1) {
      const value = (i + 1) * lineJump;
      const yOffset = value * (chartHeight / 2) / maxY;
      const posy = baselineY - yOffset;
      const negy = baselineY + yOffset;

      ctx.strokeStyle = teamColors.away;
      ctx.beginPath();
      ctx.moveTo(chartLeft, posy);
      ctx.lineTo(chartLeft + chartWidth, posy);
      ctx.stroke();
      drawDiffLabel(value, posy, teamColors.away);

      ctx.strokeStyle = teamColors.home;
      ctx.beginPath();
      ctx.moveTo(chartLeft, negy);
      ctx.lineTo(chartLeft + chartWidth, negy);
      ctx.stroke();
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
    });
  }

  const windowStartSeconds = timelineWindow?.startSeconds ?? 0;
  const windowDurationSeconds = timelineWindow?.durationSeconds ?? 0;
  const getXForTime = (period, clock) => {
    if (windowDurationSeconds <= 0) return chartLeft;
    const elapsed = getSecondsElapsed(period, clock);
    const ratio = (elapsed - windowStartSeconds) / windowDurationSeconds;
    return chartLeft + Math.max(0, Math.min(chartWidth, ratio * chartWidth));
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

      const actions = (players?.[name] || []).filter((action) => (
        action.actionType !== 'Substitution'
        && action.actionType !== 'Jump Ball'
        && action.actionType !== 'Violation'
      ));
      const size = Math.max(3, Math.min(5, rowHeight * 0.28));
      actions.forEach((action) => {
        const x = getXForTime(action.period, action.clock);
        const isFreeThrow = isFreeThrowAction(action.description, action.actionType);
        if (isFreeThrow) {
          drawFreeThrowRing(ctx, x, centerY, size * 1.1, action.description, action.subType, computed);
          return;
        }
        const eventType = getEventType(action.description, action.actionType);
        if (!eventType) return;
        const is3PT = (action.description || '').includes('3PT');
        drawEventShape(ctx, eventType, x, centerY, size, computed, is3PT);
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
    awayRowHeight
  );

  drawTeamSection(
    displayHomeTeamNames?.name || homeLabel,
    teamColors.home,
    homeNames,
    filteredHomePlayers,
    filteredHomePlayerTimeline,
    cursorY,
    homeRowHeight
  );

  const legendTop = playAreaTop + playAreaHeight + 10;
  drawLegend(ctx, computed, 12, legendTop, contentWidth - 24, isQuarterFocus);

  return canvas;
};

export const buildPlayExportCanvas = (params) => (
  buildFullExportCanvas(params) || buildLiteExportCanvas(params)
);
