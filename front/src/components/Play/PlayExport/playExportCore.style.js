import { EXPORT_MAX_SCALE, EXPORT_RENDER_SCALE, WATERMARK_TEXT } from './playExportCore.constants';

const isTransparentColor = (value) => value === 'transparent' || value === 'rgba(0, 0, 0, 0)';

export const getExportScale = () =>
  Math.min(EXPORT_MAX_SCALE, (window.devicePixelRatio || 1) * EXPORT_RENDER_SCALE);

export const resolveExportBackground = (element) => {
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

export const getCssVar = (computedStyle, varName, fallback) => {
  if (!computedStyle) return fallback;
  const value = computedStyle.getPropertyValue(varName);
  return value ? value.trim() : fallback;
};

export const truncateText = (ctx, text, maxWidth) => {
  if (!ctx || !text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed && ctx.measureText(`${trimmed}...`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed ? `${trimmed}...` : text;
};

export const formatPeriodLabel = (period) => {
  const value = Number(period);
  if (!Number.isFinite(value) || value <= 0) return '';
  return value <= 4 ? `Q${value}` : `O${value - 4}`;
};

export const formatGameDate = (value) => {
  if (!value) return '';
  const dateObj = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(dateObj.getTime())) return '';
  return dateObj.toDateString().slice(4);
};

export const drawWatermark = (ctx, computedStyle, x, y) => {
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
