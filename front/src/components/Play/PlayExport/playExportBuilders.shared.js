import { getEventType, isFreeThrowAction } from '../../../domain/events/classification';
import {
  drawEventShape,
  drawFreeThrowRing,
  formatGameDate,
  getExportScale,
  isOneOfOneFreeThrow,
  resolveExportBackground,
} from './playExportCore';

const EXCLUDED_ACTION_TYPES = new Set(['substitution', 'jump ball', 'jumpball', 'violation']);

export const getExportComputedStyle = (playRef) => {
  if (typeof window === 'undefined') return null;
  const styleSource = playRef?.current || document.documentElement;
  return window.getComputedStyle(styleSource);
};

export const createExportCanvasContext = ({
  contentWidth,
  contentHeight,
  playRef,
  outerPadding = 12,
  computedStyle,
}) => {
  if (typeof window === 'undefined') return null;
  const baseWidth = contentWidth + outerPadding * 2;
  const baseHeight = contentHeight + outerPadding * 2;
  const scale = getExportScale();

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

  return {
    canvas,
    ctx,
    computed: computedStyle || getExportComputedStyle(playRef),
    baseWidth,
    baseHeight,
    scale,
  };
};

export const getScoreTimelineSource = (filteredScoreTimeline, displayScoreTimeline) =>
  filteredScoreTimeline && filteredScoreTimeline.length
    ? filteredScoreTimeline
    : displayScoreTimeline || [];

export const drawCommonHeaderMeta = ({
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
  titleX = 6,
  titleY = 22,
  dateY = 38,
  scoreY = 22,
  statusY = 38,
  titleFont = '600 16px system-ui, -apple-system, sans-serif',
  rangeFont = '600 12px system-ui, -apple-system, sans-serif',
  dateFont = '500 12px system-ui, -apple-system, sans-serif',
  scoreFont = '600 14px system-ui, -apple-system, sans-serif',
  statusFont = '600 12px system-ui, -apple-system, sans-serif',
}) => {
  if (!ctx) return { formattedGameDate: '' };

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = textPrimary;
  ctx.font = titleFont;
  const titleText = `${awayLabel} vs ${homeLabel}`;
  ctx.fillText(titleText, titleX, titleY);

  if (rangeLabel) {
    const titleWidth = ctx.measureText(titleText).width;
    ctx.fillStyle = textSecondary;
    ctx.font = rangeFont;
    ctx.fillText(rangeLabel, titleX + titleWidth + 8, titleY);
  }

  const formattedGameDate = formatGameDate(gameDate);
  if (formattedGameDate) {
    ctx.fillStyle = textSecondary;
    ctx.font = dateFont;
    ctx.fillText(formattedGameDate, titleX, dateY);
  }

  const lastScoreEntry = scoreTimelineSource.length
    ? scoreTimelineSource[scoreTimelineSource.length - 1]
    : null;
  if (lastScoreEntry) {
    const scoreText = `${awayLabel} ${lastScoreEntry.away} - ${lastScoreEntry.home} ${homeLabel}`;
    ctx.fillStyle = textPrimary;
    ctx.font = scoreFont;
    const textWidth = ctx.measureText(scoreText).width;
    ctx.fillText(scoreText, contentWidth - rightPad - textWidth, scoreY);
  }

  if (statusLabel) {
    ctx.fillStyle = textSecondary;
    ctx.font = statusFont;
    const statusWidth = ctx.measureText(statusLabel).width;
    ctx.fillText(statusLabel, contentWidth - rightPad - statusWidth, statusY);
  }

  return { formattedGameDate };
};

export const drawFittedHeaderText = ({
  ctx,
  text,
  x,
  y,
  maxWidth,
  color,
  fontFamily = 'system-ui, -apple-system, sans-serif',
  maxFontSize = 12,
  minFontSize = 9,
  fontWeight = '600',
}) => {
  if (!ctx || !text) return minFontSize;

  let fontSize = maxFontSize;
  ctx.fillStyle = color;
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

  while (fontSize > minFontSize && ctx.measureText(text).width > maxWidth) {
    fontSize -= 1;
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  }

  ctx.fillText(text, x, y);
  return fontSize;
};

export const filterRenderableActions = (actions = []) =>
  actions.filter((action) => {
    const type = (action?.actionType || '').toString().toLowerCase();
    return !EXCLUDED_ACTION_TYPES.has(type);
  });

export const buildMarkerLookups = (actions = []) => {
  const pointAtTime = new Set();
  const freeThrowOneAtTime = new Set();

  actions.forEach((action) => {
    const timeKey = `${action.period}|${action.clock}`;
    if (isFreeThrowAction(action.description, action.actionType)) {
      if (isOneOfOneFreeThrow(action)) {
        freeThrowOneAtTime.add(timeKey);
      }
      return;
    }
    if (getEventType(action.description, action.actionType, action.result) === 'point') {
      pointAtTime.add(timeKey);
    }
  });

  return { pointAtTime, freeThrowOneAtTime };
};

export const drawRowMarkers = ({
  ctx,
  actions,
  markerLookups,
  getXForAction,
  centerY,
  size,
  computedStyle,
}) => {
  if (!ctx || !Array.isArray(actions) || !getXForAction) return;

  const lookups = markerLookups || buildMarkerLookups(actions);
  actions.forEach((action) => {
    const x = getXForAction(action);
    const isFreeThrow = isFreeThrowAction(action.description, action.actionType);
    const timeKey = `${action.period}|${action.clock}`;

    if (isFreeThrow) {
      const isAnd1 = lookups.freeThrowOneAtTime.has(timeKey) && lookups.pointAtTime.has(timeKey);
      drawFreeThrowRing(
        ctx,
        x,
        centerY,
        size * 1.1,
        action.description,
        action.subType,
        computedStyle,
        isAnd1,
      );
      return;
    }

    const eventType = getEventType(action.description, action.actionType, action.result);
    if (!eventType) return;
    const type = (action.actionType || '').toString().toLowerCase();
    const desc = (action.description || '').toString().toLowerCase();
    const is3PT = type === '3pt' || desc.includes('3pt');
    drawEventShape(ctx, eventType, x, centerY, size, computedStyle, is3PT);
  });
};
