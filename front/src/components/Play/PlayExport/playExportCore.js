import {
  getPeriodDurationSeconds,
  getPeriodStartSeconds,
  getSecondsElapsed,
} from '../../../helpers/playTimeline';
import {
  getEventType,
  isFreeThrowAction,
  isMissDescription,
  isThreePointAction,
} from '../../../domain/events/classification';
import { EVENT_TYPES } from '../../../ui/eventShapes.jsx';

export const DESKTOP_EXPORT_WIDTH = 1235;
export const MOBILE_EXPORT_MAX_WIDTH = 1024;
const TIMELINE_ICON_SCALE = 0.8;
const WATERMARK_TEXT = 'MinutesMap.com';
const EXPORT_RENDER_SCALE = 2.5;
const EXPORT_MAX_SCALE = 3;

const getExportScale = () =>
  Math.min(EXPORT_MAX_SCALE, (window.devicePixelRatio || 1) * EXPORT_RENDER_SCALE);

const sanitizeFilePart = (value) =>
  String(value || '')
    .trim()
    .replace(/[^a-z0-9-_]+/gi, '_')
    .replace(/^_+|_+$/g, '');

const isTransparentColor = (value) => value === 'transparent' || value === 'rgba(0, 0, 0, 0)';

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
  rangeLabel,
  isFullGameRange,
  gameId,
}) => {
  const away = awayTeamNames?.abr || 'Away';
  const home = homeTeamNames?.abr || 'Home';
  const periodLabel = rangeLabel || (isFullGameRange ? 'Game' : 'Range');
  const base = periodLabel ? `${away}-vs-${home}-${periodLabel}` : `${away}-vs-${home}`;
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
  } catch (_err) {
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

const formatPeriodLabel = (period) => {
  const value = Number(period);
  if (!Number.isFinite(value) || value <= 0) return '';
  return value <= 4 ? `Q${value}` : `O${value - 4}`;
};

const formatGameDate = (value) => {
  if (!value) return '';
  const dateObj = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(dateObj.getTime())) return '';
  return dateObj.toDateString().slice(4);
};

const FREE_THROW_PATTERN = /\b(?:ft|free throw)\b\s*(\d+)\s*(?:of|\/)\s*(\d+)/i;
const FREE_THROW_ONE_OF_ONE_PATTERN = /\b(?:ft|free throw)\b\s*1\s*(?:of|\/)\s*1/i;

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

const isOneOfOneFreeThrow = (action) => {
  const text = `${action?.subType || ''} ${action?.description || ''}`;
  return FREE_THROW_ONE_OF_ONE_PATTERN.test(text);
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
        { x: cx - size, y: cy },
      ]);
      break;
    }
    case 'chevron': {
      drawPolygon(ctx, [
        { x: cx - size * 0.6, y: cy - size },
        { x: cx + size, y: cy },
        { x: cx - size * 0.6, y: cy + size },
      ]);
      break;
    }
    case 'triangleDown': {
      drawPolygon(ctx, [
        { x: cx, y: cy + size },
        { x: cx - size, y: cy - size * 0.7 },
        { x: cx + size, y: cy - size * 0.7 },
      ]);
      break;
    }
    case 'triangleUp': {
      drawPolygon(ctx, [
        { x: cx, y: cy - size },
        { x: cx - size, y: cy + size * 0.7 },
        { x: cx + size, y: cy + size * 0.7 },
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

const drawFreeThrowRing = (
  ctx,
  cx,
  cy,
  size,
  description,
  subType,
  computedStyle,
  isAnd1 = false,
) => {
  if (!ctx) return;
  const isMiss = isMissDescription(description);
  const { attempt, total } = getFreeThrowAttempt(description, subType);
  const ringRatio = isAnd1 ? 1.15 : getFreeThrowRingRatio(attempt, total);
  const strokeWidth = Math.max(1, size * 0.2);
  let ringRadius = size * ringRatio;
  if (!isAnd1 && total > 1 && attempt === 1) {
    ringRadius = Math.max(0.5, ringRadius - strokeWidth / 2);
  }
  const ringColor = isMiss
    ? getCssVar(computedStyle, '--event-miss', '#475569')
    : getCssVar(computedStyle, '--event-point', '#F59E0B');
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = strokeWidth;
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

const drawWatermark = (ctx, computedStyle, x, y) => {
  if (!ctx) return;
  const baseColor = getCssVar(computedStyle, '--text-secondary', '#6b7280');
  ctx.save();
  ctx.fillStyle = baseColor;
  ctx.globalAlpha = 0.6;
  ctx.font = '500 12px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(WATERMARK_TEXT, x, y);
  ctx.restore();
};

const getPeriodCountFromRange = (periodRange, fallback = 4) => {
  const start = Number(periodRange?.start);
  const end = Number(periodRange?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return fallback;
  return Math.max(1, end - start + 1);
};

const getQuarterAwareLegendScale = (periodCount) => {
  const currentScale = 0.85;
  const q1Scale = 0.6;
  const count = Number(periodCount);
  if (!Number.isFinite(count) || count <= 0) return currentScale;
  if (count >= 4) return currentScale;
  if (count <= 1) return q1Scale;
  const ratio = (count - 1) / 3;
  return q1Scale + (currentScale - q1Scale) * ratio;
};

const getFullTimelineLegendScale = (periodCount) => {
  const currentScale = 0.85;
  const q1Scale = 0.78;
  const count = Number(periodCount);
  if (!Number.isFinite(count) || count <= 0) return currentScale;
  if (count >= 4) return currentScale;
  if (count <= 1) return q1Scale;
  const ratio = (count - 1) / 3;
  return q1Scale + (currentScale - q1Scale) * ratio;
};

const getQuarterAwareLegendGap = (periodCount, q1Gap, q4Gap) => {
  const minGap = Number(q1Gap);
  const maxGap = Number(q4Gap);
  if (!Number.isFinite(minGap) || !Number.isFinite(maxGap)) return 0;
  const count = Number(periodCount);
  if (!Number.isFinite(count) || count <= 0) return maxGap;
  if (count >= 4) return maxGap;
  if (count <= 1) return minGap;
  const ratio = (count - 1) / 3;
  return minGap + (maxGap - minGap) * ratio;
};

const drawLegend = (
  ctx,
  computedStyle,
  startX,
  startY,
  maxWidth,
  allowWrap = false,
  statOn,
  showScoreDiff,
  includeScoreLead = true,
  legendScale = 1,
  forceWrapAfterGroupIndex = null,
) => {
  if (!ctx) return startY;
  const normalizedLegendScale = Number.isFinite(legendScale) && legendScale > 0 ? legendScale : 1;
  const rowHeight = 18 * normalizedLegendScale;
  const rowGap = 8 * normalizedLegendScale;
  const textColor = getCssVar(computedStyle, '--text-secondary', '#6b7280');
  const labelColor = getCssVar(computedStyle, '--stat-label-color', textColor);
  const labelOffColor = getCssVar(computedStyle, '--stat-label-off', '#94a3b8');
  const isStatOn = (index) => (Array.isArray(statOn) ? statOn[index] !== false : true);
  const isScoreLeadOn = showScoreDiff !== false;
  ctx.textBaseline = 'middle';

  const buildRow = ({ iconSize, fontSize, itemGap, groupGap }) => {
    const iconBox = iconSize * 2;
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;

    const createItem = (label, drawIcon, isOff = false) => {
      const labelWidth = ctx.measureText(label).width;
      return {
        label,
        labelWidth,
        drawIcon,
        isOff,
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
        const labelX = cursor + iconBox + 4;
        if (item.isOff) {
          ctx.save();
          ctx.globalAlpha = 0.35;
        }
        item.drawIcon(cursor + iconSize, y - 1);
        ctx.fillStyle = item.isOff ? labelOffColor : labelColor;
        ctx.fillText(item.label, labelX, y + 1);
        if (item.isOff) {
          ctx.restore();
          ctx.strokeStyle = labelOffColor;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(labelX, y + 1);
          ctx.lineTo(labelX + item.labelWidth, y + 1);
          ctx.stroke();
        }
        cursor += item.width + itemGap;
      });
    };

    const pointGroup = buildGroup([
      createItem(
        '2PT',
        (cx, cy) => drawEventShape(ctx, 'point', cx, cy, iconSize, computedStyle, false),
        !isStatOn(0),
      ),
      createItem(
        '3PT',
        (cx, cy) => drawEventShape(ctx, 'point', cx, cy, iconSize, computedStyle, true),
        !isStatOn(0),
      ),
      createItem(
        'FT',
        (cx, cy) => drawFreeThrowLegendRing(ctx, cx, cy, iconSize * 0.95, computedStyle, false),
        !isStatOn(0),
      ),
    ]);
    const missGroup = buildGroup([
      createItem(
        'Miss',
        (cx, cy) => drawEventShape(ctx, 'miss', cx, cy, iconSize, computedStyle, false),
        !isStatOn(1),
      ),
      createItem(
        '3PT',
        (cx, cy) => drawEventShape(ctx, 'miss', cx, cy, iconSize, computedStyle, true),
        !isStatOn(1),
      ),
      createItem(
        'FT',
        (cx, cy) => drawFreeThrowLegendRing(ctx, cx, cy, iconSize * 0.95, computedStyle, true),
        !isStatOn(1),
      ),
    ]);
    const reboundGroup = buildGroup([
      createItem(
        'Rebound',
        (cx, cy) => drawEventShape(ctx, 'rebound', cx, cy, iconSize, computedStyle, false),
        !isStatOn(2),
      ),
    ]);
    const assistGroup = buildGroup([
      createItem(
        'Assist',
        (cx, cy) => drawEventShape(ctx, 'assist', cx, cy, iconSize, computedStyle, false),
        !isStatOn(3),
      ),
    ]);
    const turnoverGroup = buildGroup([
      createItem(
        'Turnover',
        (cx, cy) => drawEventShape(ctx, 'turnover', cx, cy, iconSize, computedStyle, false),
        !isStatOn(4),
      ),
    ]);
    const blockGroup = buildGroup([
      createItem(
        'Block',
        (cx, cy) => drawEventShape(ctx, 'block', cx, cy, iconSize, computedStyle, false),
        !isStatOn(5),
      ),
    ]);
    const stealGroup = buildGroup([
      createItem(
        'Steal',
        (cx, cy) => drawEventShape(ctx, 'steal', cx, cy, iconSize, computedStyle, false),
        !isStatOn(6),
      ),
    ]);
    const foulGroup = buildGroup([
      createItem(
        'Foul',
        (cx, cy) => drawEventShape(ctx, 'foul', cx, cy, iconSize, computedStyle, false),
        !isStatOn(7),
      ),
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
    ];
    if (includeScoreLead) {
      const scoreLeadGroup = buildGroup([
        createItem(
          'Score Lead',
          (cx, cy) => drawScoreLeadIcon(ctx, cx, cy, iconSize, computedStyle),
          !isScoreLeadOn,
        ),
      ]);
      groups.push(scoreLeadGroup);
    }

    const rowWidth =
      groups.reduce((sum, group) => sum + group.width, 0) +
      groupGap * Math.max(0, groups.length - 1);

    return { groups, rowWidth, drawGroup, groupGap };
  };

  let rowConfig = buildRow({
    iconSize: 6 * normalizedLegendScale,
    fontSize: 11 * normalizedLegendScale,
    itemGap: 10 * normalizedLegendScale,
    groupGap: 16 * normalizedLegendScale,
  });
  if (rowConfig.rowWidth > maxWidth && !allowWrap) {
    rowConfig = buildRow({
      iconSize: 5 * normalizedLegendScale,
      fontSize: 10 * normalizedLegendScale,
      itemGap: 8 * normalizedLegendScale,
      groupGap: 12 * normalizedLegendScale,
    });
  }

  const rowY = startY + rowHeight / 2;

  if (allowWrap) {
    const rows = [[]];
    const rowWidths = [0];
    rowConfig.groups.forEach((group, index) => {
      const rowIndex = rows.length - 1;
      const addWidth = group.width + (rows[rowIndex].length ? rowConfig.groupGap : 0);
      if (rows[rowIndex].length && rowWidths[rowIndex] + addWidth > maxWidth) {
        rows.push([group]);
        rowWidths.push(group.width);
      } else {
        rows[rowIndex].push(group);
        rowWidths[rowIndex] += addWidth;
      }
      if (forceWrapAfterGroupIndex === index && index < rowConfig.groups.length - 1) {
        rows.push([]);
        rowWidths.push(0);
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

const measureLegendHeight = (
  ctx,
  computedStyle,
  maxWidth,
  allowWrap = false,
  statOn,
  showScoreDiff,
  includeScoreLead = true,
  legendScale = 1,
  forceWrapAfterGroupIndex = null,
) => {
  if (!ctx) return 0;
  const normalizedLegendScale = Number.isFinite(legendScale) && legendScale > 0 ? legendScale : 1;
  const rowHeight = 18 * normalizedLegendScale;
  const rowGap = 8 * normalizedLegendScale;
  const isStatOn = (index) => (Array.isArray(statOn) ? statOn[index] !== false : true);
  const isScoreLeadOn = showScoreDiff !== false;

  const buildRow = ({ iconSize, fontSize, itemGap, groupGap }) => {
    const iconBox = iconSize * 2;
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;

    const createItem = (label, isOff = false) => {
      const labelWidth = ctx.measureText(label).width;
      return {
        label,
        labelWidth,
        isOff,
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

    const pointGroup = buildGroup([
      createItem('2PT', !isStatOn(0)),
      createItem('3PT', !isStatOn(0)),
      createItem('FT', !isStatOn(0)),
    ]);
    const missGroup = buildGroup([
      createItem('Miss', !isStatOn(1)),
      createItem('3PT', !isStatOn(1)),
      createItem('FT', !isStatOn(1)),
    ]);
    const reboundGroup = buildGroup([createItem('Rebound', !isStatOn(2))]);
    const assistGroup = buildGroup([createItem('Assist', !isStatOn(3))]);
    const turnoverGroup = buildGroup([createItem('Turnover', !isStatOn(4))]);
    const blockGroup = buildGroup([createItem('Block', !isStatOn(5))]);
    const stealGroup = buildGroup([createItem('Steal', !isStatOn(6))]);
    const foulGroup = buildGroup([createItem('Foul', !isStatOn(7))]);
    const groups = [
      pointGroup,
      missGroup,
      reboundGroup,
      assistGroup,
      turnoverGroup,
      blockGroup,
      stealGroup,
      foulGroup,
    ];
    if (includeScoreLead) {
      const scoreLeadGroup = buildGroup([createItem('Score Lead', !isScoreLeadOn)]);
      groups.push(scoreLeadGroup);
    }

    const rowWidth =
      groups.reduce((sum, group) => sum + group.width, 0) +
      groupGap * Math.max(0, groups.length - 1);

    return { groups, rowWidth, groupGap };
  };

  let rowConfig = buildRow({
    iconSize: 6 * normalizedLegendScale,
    fontSize: 11 * normalizedLegendScale,
    itemGap: 10 * normalizedLegendScale,
    groupGap: 16 * normalizedLegendScale,
  });
  if (rowConfig.rowWidth > maxWidth && !allowWrap) {
    rowConfig = buildRow({
      iconSize: 5 * normalizedLegendScale,
      fontSize: 10 * normalizedLegendScale,
      itemGap: 8 * normalizedLegendScale,
      groupGap: 12 * normalizedLegendScale,
    });
  }

  if (!allowWrap) {
    return rowHeight;
  }

  const rows = [[]];
  const rowWidths = [0];
  rowConfig.groups.forEach((group, index) => {
    const rowIndex = rows.length - 1;
    const addWidth = group.width + (rows[rowIndex].length ? rowConfig.groupGap : 0);
    if (rows[rowIndex].length && rowWidths[rowIndex] + addWidth > maxWidth) {
      rows.push([group]);
      rowWidths.push(group.width);
    } else {
      rows[rowIndex].push(group);
      rowWidths[rowIndex] += addWidth;
    }
    if (forceWrapAfterGroupIndex === index && index < rowConfig.groups.length - 1) {
      rows.push([]);
      rowWidths.push(0);
    }
  });

  const rowCount = rows.length || 1;
  return rowHeight * rowCount + rowGap * Math.max(0, rowCount - 1);
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

const BOX_TABLE_HEADER_HEIGHT = 20;
const BOX_TABLE_ROW_HEIGHT = 22;
const BOX_TABLE_FONT_HEADER = '600 9px system-ui, -apple-system, sans-serif';
const BOX_TABLE_FONT_VALUE = '600 10px system-ui, -apple-system, sans-serif';
const BOX_TABLE_PADDING_X = 6;
const BOX_HIGHLIGHT_KEYS = new Set(['pts', 'reb', 'ast']);
const STACKED_BOX_SCORE_WEIGHTS = {
  min: 1.3,
  fg: 1.25,
  '3p': 1.25,
  ft: 1.25,
  reb: 0.8,
  ast: 0.8,
  stl: 0.8,
  blk: 0.8,
  to: 0.8,
  pf: 0.8,
  pm: 0.8,
};

const drawBoxScoreTable = (ctx, computedStyle, columns, startX, startY, maxWidth, options = {}) => {
  if (!ctx || !columns || !columns.length) return 0;
  const textHeading = getCssVar(computedStyle, '--text-heading', '#374151');
  const textPrimary = getCssVar(computedStyle, '--text-primary', '#111111');
  const textSecondary = getCssVar(computedStyle, '--text-secondary', '#6b7280');
  const headerBg = getCssVar(computedStyle, '--bg-table-header', '#ffffff');
  const rowBg = getCssVar(computedStyle, '--bg-table-even', '#f9fafb');
  const highlightHeaderBg = getCssVar(computedStyle, '--bg-highlight-col-header', '#dbeafe');
  const highlightBg = getCssVar(computedStyle, '--bg-highlight-col', '#eff6ff');
  const dividerColor = getCssVar(computedStyle, '--divider', '#e5e7eb');

  const statCount = Math.max(1, columns.length - 1);
  const minStatWidth = 30;
  const minPlayerWidth = 70;
  const maxPlayerWidth = 160;
  let playerWidth = Math.min(maxPlayerWidth, Math.max(90, maxWidth * 0.28));
  let widths = [];

  if (options?.statWeights && columns.length > 1) {
    const statWeights = columns.slice(1).map((col) => {
      const weight = Number(options.statWeights[col.key]);
      return Number.isFinite(weight) && weight > 0 ? weight : 1;
    });
    const totalWeight = statWeights.reduce((sum, weight) => sum + weight, 0);
    const minWeight = Math.min(...statWeights);
    if (
      Number.isFinite(totalWeight) &&
      totalWeight > 0 &&
      Number.isFinite(minWeight) &&
      minWeight > 0
    ) {
      let availableWidth = maxWidth - playerWidth;
      const requiredAvailable = (minStatWidth * totalWeight) / minWeight;
      if (availableWidth < requiredAvailable) {
        playerWidth = Math.max(minPlayerWidth, maxWidth - requiredAvailable);
        availableWidth = maxWidth - playerWidth;
      }
      widths = [
        playerWidth,
        ...statWeights.map((weight) => (availableWidth * weight) / totalWeight),
      ];
    }
  }

  if (!widths.length) {
    let statWidth = (maxWidth - playerWidth) / statCount;
    if (statWidth < minStatWidth) {
      playerWidth = Math.max(minPlayerWidth, maxWidth - statCount * minStatWidth);
      statWidth = (maxWidth - playerWidth) / statCount;
    }
    widths = columns.map((_, index) => (index === 0 ? playerWidth : statWidth));
  }

  const headerTop = startY;
  const rowTop = headerTop + BOX_TABLE_HEADER_HEIGHT;

  ctx.fillStyle = headerBg;
  ctx.fillRect(startX, headerTop, maxWidth, BOX_TABLE_HEADER_HEIGHT);
  ctx.fillStyle = rowBg;
  ctx.fillRect(startX, rowTop, maxWidth, BOX_TABLE_ROW_HEIGHT);

  let cursorX = startX;
  columns.forEach((col, index) => {
    const width = widths[index];
    const isHighlight = BOX_HIGHLIGHT_KEYS.has(col.key);
    if (isHighlight) {
      ctx.fillStyle = highlightHeaderBg;
      ctx.fillRect(cursorX, headerTop, width, BOX_TABLE_HEADER_HEIGHT);
      ctx.fillStyle = highlightBg;
      ctx.fillRect(cursorX, rowTop, width, BOX_TABLE_ROW_HEIGHT);
    }

    ctx.textBaseline = 'middle';
    ctx.font = BOX_TABLE_FONT_HEADER;
    ctx.fillStyle = textHeading;
    ctx.textAlign = index === 0 ? 'left' : 'center';
    const headerX = index === 0 ? cursorX + BOX_TABLE_PADDING_X : cursorX + width / 2;
    ctx.fillText(col.label, headerX, headerTop + BOX_TABLE_HEADER_HEIGHT / 2);

    ctx.font = BOX_TABLE_FONT_VALUE;
    ctx.fillStyle = index === 0 ? textSecondary : textPrimary;
    const valueText =
      index === 0 ? truncateText(ctx, col.value, width - BOX_TABLE_PADDING_X * 2) : col.value;
    const valueX = index === 0 ? cursorX + BOX_TABLE_PADDING_X : cursorX + width / 2;
    ctx.fillText(valueText, valueX, rowTop + BOX_TABLE_ROW_HEIGHT / 2);

    cursorX += width;
  });

  ctx.strokeStyle = dividerColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(startX, rowTop);
  ctx.lineTo(startX + maxWidth, rowTop);
  ctx.stroke();

  ctx.textAlign = 'left';
  return BOX_TABLE_HEADER_HEIGHT + BOX_TABLE_ROW_HEIGHT;
};

const formatMinutesSeconds = (totalSeconds) => {
  const total = Math.max(0, Math.round(totalSeconds || 0));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const computePlayerBoxScore = ({
  actions,
  timeline,
  scoreTimeline,
  displayScoreTimeline,
  periodRange,
  teamKey,
}) => {
  const stats = {
    seconds: 0,
    pts: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    ftm: 0,
    fta: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    to: 0,
    pf: 0,
    pm: 0,
  };

  (timeline || []).forEach((entry) => {
    if (!entry?.start || !entry?.end) return;
    const start = getSecondsElapsed(entry.period, entry.start);
    const end = getSecondsElapsed(entry.period, entry.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    const duration = Math.max(0, end - start);
    stats.seconds += duration;
  });

  (actions || []).forEach((action) => {
    const type = (action?.actionType || '').toString().toLowerCase();
    const desc = (action?.description || '').toString().toLowerCase();
    const result = (action?.result || '').toString().toLowerCase();
    const eventType = getEventType(desc, type, result);
    const isShotEvent = eventType === 'point' || eventType === 'miss';
    if (isShotEvent) {
      const isFreeThrow = isFreeThrowAction(desc, type);
      const isThree = isThreePointAction(desc, type);
      if (isFreeThrow) {
        stats.fta += 1;
        if (eventType === 'point') {
          stats.ftm += 1;
          stats.pts += 1;
        }
        return;
      }
      stats.fga += 1;
      if (isThree) {
        stats.tpa += 1;
      }
      if (eventType === 'point') {
        stats.fgm += 1;
        stats.pts += isThree ? 3 : 2;
        if (isThree) {
          stats.tpm += 1;
        }
      }
      return;
    }
    if (eventType === 'rebound') {
      stats.reb += 1;
    } else if (eventType === 'assist') {
      stats.ast += 1;
    } else if (eventType === 'steal') {
      stats.stl += 1;
    } else if (eventType === 'block') {
      stats.blk += 1;
    } else if (eventType === 'turnover') {
      stats.to += 1;
    } else if (eventType === 'foul') {
      stats.pf += 1;
    }
  });

  if (teamKey) {
    const segments = (timeline || [])
      .map((entry) => {
        if (!entry?.start || !entry?.end) return null;
        const start = getSecondsElapsed(entry.period, entry.start);
        const end = getSecondsElapsed(entry.period, entry.end);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
        const s = Math.min(start, end);
        const e = Math.max(start, end);
        return { start: s, end: e };
      })
      .filter(Boolean);
    const isOnCourt = (elapsed) =>
      segments.some((seg) => elapsed >= seg.start && elapsed <= seg.end);

    const rangeStart = Number(periodRange?.start);
    const rangeEnd = Number(periodRange?.end);
    const rangeStartSeconds = Number.isFinite(rangeStart) ? getPeriodStartSeconds(rangeStart) : 0;
    const rangeEndSeconds = Number.isFinite(rangeEnd)
      ? getPeriodStartSeconds(rangeEnd) + getPeriodDurationSeconds(rangeEnd)
      : Infinity;

    const scoreSource =
      displayScoreTimeline && displayScoreTimeline.length
        ? displayScoreTimeline
        : scoreTimeline || [];
    const scored = (scoreSource || [])
      .map((entry) => {
        const elapsed = getSecondsElapsed(entry.period, entry.clock);
        if (!Number.isFinite(elapsed)) return null;
        return { ...entry, elapsed };
      })
      .filter(Boolean)
      .sort((a, b) => a.elapsed - b.elapsed);

    let prev = null;
    scored.forEach((entry) => {
      if (entry.elapsed <= rangeStartSeconds) {
        prev = entry;
      }
    });

    scored
      .filter((entry) => entry.elapsed >= rangeStartSeconds && entry.elapsed <= rangeEndSeconds)
      .forEach((entry) => {
        if (!prev) {
          prev = entry;
          return;
        }
        const deltaAway = Number(entry.away) - Number(prev.away);
        const deltaHome = Number(entry.home) - Number(prev.home);
        if (deltaAway || deltaHome) {
          if (isOnCourt(entry.elapsed)) {
            stats.pm += teamKey === 'away' ? deltaAway - deltaHome : deltaHome - deltaAway;
          }
        }
        prev = entry;
      });
  }

  return stats;
};

const buildBoxScoreColumns = (stats, playerName, includeAttempts) => {
  const plusMinus = stats.pm === 0 ? '0' : stats.pm > 0 ? `+${stats.pm}` : `${stats.pm}`;
  const columns = [
    { key: 'player', label: 'PLAYER', value: playerName || 'Player' },
    { key: 'min', label: 'MIN', value: formatMinutesSeconds(stats.seconds) },
    { key: 'pts', label: 'PTS', value: `${stats.pts}` },
  ];
  if (includeAttempts) {
    columns.push(
      { key: 'fg', label: 'FG', value: `${stats.fgm}-${stats.fga}` },
      { key: '3p', label: '3P', value: `${stats.tpm}-${stats.tpa}` },
      { key: 'ft', label: 'FT', value: `${stats.ftm}-${stats.fta}` },
    );
  }
  columns.push(
    { key: 'reb', label: 'REB', value: `${stats.reb}` },
    { key: 'ast', label: 'AST', value: `${stats.ast}` },
    { key: 'stl', label: 'STL', value: `${stats.stl}` },
    { key: 'blk', label: 'BLK', value: `${stats.blk}` },
    { key: 'to', label: 'TO', value: `${stats.to}` },
    { key: 'pf', label: 'PF', value: `${stats.pf}` },
    { key: 'pm', label: '+/-', value: plusMinus },
  );
  return columns;
};

const drawPeriodCaps = (ctx, xStart, xEnd, centerY, color) => {
  if (!ctx) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(xStart, centerY - 6);
  ctx.lineTo(xStart, centerY + 6);
  ctx.moveTo(xEnd, centerY - 6);
  ctx.lineTo(xEnd, centerY + 6);
  ctx.stroke();
  ctx.restore();
};

export {
  TIMELINE_ICON_SCALE,
  getExportScale,
  resolveExportBackground,
  getCssVar,
  truncateText,
  formatPeriodLabel,
  formatGameDate,
  isOneOfOneFreeThrow,
  drawEventShape,
  drawFreeThrowRing,
  drawWatermark,
  getPeriodCountFromRange,
  getQuarterAwareLegendScale,
  getFullTimelineLegendScale,
  getQuarterAwareLegendGap,
  drawLegend,
  measureLegendHeight,
  drawStepScoreDiff,
  BOX_TABLE_HEADER_HEIGHT,
  BOX_TABLE_ROW_HEIGHT,
  STACKED_BOX_SCORE_WEIGHTS,
  drawBoxScoreTable,
  computePlayerBoxScore,
  buildBoxScoreColumns,
  drawPeriodCaps,
};
