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
  teamLogos = null,
  scoreLogoSize = 20,
  scoreLogoGap = 6,
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
    const logoSize = Math.max(14, Number(scoreLogoSize) || 20);
    const logoTop = scoreY - logoSize + 4;
    const canDrawAwayLogo =
      teamLogos?.away &&
      Number.isFinite(teamLogos.away.naturalWidth) &&
      teamLogos.away.naturalWidth > 0;
    const canDrawHomeLogo =
      teamLogos?.home &&
      Number.isFinite(teamLogos.home.naturalWidth) &&
      teamLogos.home.naturalWidth > 0;
    const logoWidth =
      (canDrawAwayLogo ? logoSize + scoreLogoGap : 0) +
      (canDrawHomeLogo ? logoSize + scoreLogoGap : 0);
    let cursorX = contentWidth - rightPad - textWidth - logoWidth;

    if (canDrawAwayLogo) {
      try {
        ctx.drawImage(teamLogos.away, cursorX, logoTop, logoSize, logoSize);
        cursorX += logoSize + scoreLogoGap;
      } catch (_err) {
        // Ignore logo draw errors and keep text rendering.
      }
    }

    ctx.fillText(scoreText, cursorX, scoreY);
    cursorX += textWidth + scoreLogoGap;

    if (canDrawHomeLogo) {
      try {
        ctx.drawImage(teamLogos.home, cursorX, logoTop, logoSize, logoSize);
      } catch (_err) {
        // Ignore logo draw errors and keep text rendering.
      }
    }
  }

  if (statusLabel) {
    ctx.fillStyle = textSecondary;
    ctx.font = statusFont;
    const statusWidth = ctx.measureText(statusLabel).width;
    ctx.fillText(statusLabel, contentWidth - rightPad - statusWidth, statusY);
  }

  return { formattedGameDate };
};

const HEADER_TOP_PADDING = 2;
const HEADER_DATE_HEIGHT = 16;
const HEADER_DATE_GAP = 2;
const HEADER_ROW_HEIGHT = 62;
const HEADER_STATUS_GAP = 4;
const HEADER_STATUS_HEIGHT = 18;
const HEADER_BOTTOM_PADDING = 4;

const hasRenderableLogo = (logo) =>
  Boolean(logo && Number.isFinite(logo.naturalWidth) && logo.naturalWidth > 0);

export const measureCenteredScoreHeaderHeight = ({ gameDate, statusLabel }) => {
  const hasDate = Boolean(formatGameDate(gameDate));
  const hasStatus = Boolean(String(statusLabel || '').trim());
  return (
    HEADER_TOP_PADDING +
    (hasDate ? HEADER_DATE_HEIGHT + HEADER_DATE_GAP : 0) +
    HEADER_ROW_HEIGHT +
    (hasStatus ? HEADER_STATUS_GAP + HEADER_STATUS_HEIGHT : 0) +
    HEADER_BOTTOM_PADDING
  );
};

export const drawCenteredScoreHeader = ({
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
  y = 0,
  dateFont = '500 15px system-ui, -apple-system, sans-serif',
  statusFont = '600 13px system-ui, -apple-system, sans-serif',
  logoSize = 52,
}) => {
  if (!ctx) return { bottomY: y };

  const lastScoreEntry = scoreTimelineSource?.length
    ? scoreTimelineSource[scoreTimelineSource.length - 1]
    : null;
  const awayScore = String(lastScoreEntry?.away ?? '--');
  const homeScore = String(lastScoreEntry?.home ?? '--');
  const awayAbbr = String(awayLabel || 'Away');
  const homeAbbr = String(homeLabel || 'Home');
  const atLabel = 'AT';
  const hasAwayLogo = hasRenderableLogo(teamLogos?.away);
  const hasHomeLogo = hasRenderableLogo(teamLogos?.home);
  const formattedGameDate = formatGameDate(gameDate);
  const hasDate = Boolean(formattedGameDate);
  const rowTop = y + HEADER_TOP_PADDING + (hasDate ? HEADER_DATE_HEIGHT + HEADER_DATE_GAP : 0);
  const rowMidY = rowTop + HEADER_ROW_HEIGHT / 2;
  const fontFamily = 'system-ui, -apple-system, sans-serif';
  const maxHeaderWidth = Math.max(0, contentWidth - 12);

  ctx.save();
  ctx.textBaseline = 'middle';

  const measureLayout = (scale) => {
    const scorePx = Math.max(28, Math.round(40 * scale));
    const teamPx = Math.max(16, Math.round(22 * scale));
    const atPx = Math.max(10, Math.round(14 * scale));
    const logoPx = Math.max(34, Math.round(logoSize * scale));
    const scoreGap = Math.max(6, Math.round(12 * scale));
    const logoGap = Math.max(4, Math.round(8 * scale));
    const sideGap = Math.max(8, Math.round(16 * scale));

    const scaledScoreFont = `700 ${scorePx}px ${fontFamily}`;
    const scaledTeamFont = `700 ${teamPx}px ${fontFamily}`;
    const scaledAtFont = `700 ${atPx}px ${fontFamily}`;

    ctx.font = scaledScoreFont;
    const awayScoreWidth = ctx.measureText(awayScore).width;
    const homeScoreWidth = ctx.measureText(homeScore).width;

    ctx.font = scaledTeamFont;
    const awayAbbrWidth = ctx.measureText(awayAbbr).width;
    const homeAbbrWidth = ctx.measureText(homeAbbr).width;

    ctx.font = scaledAtFont;
    const atWidth = ctx.measureText(atLabel).width;

    const awayLogoWidth = hasAwayLogo ? logoPx : 0;
    const homeLogoWidth = hasHomeLogo ? logoPx : 0;
    const awayLogoPad = hasAwayLogo ? logoGap : 0;
    const homeLogoPad = hasHomeLogo ? logoGap : 0;
    const totalWidth =
      awayScoreWidth +
      scoreGap +
      awayLogoWidth +
      awayLogoPad +
      awayAbbrWidth +
      sideGap +
      atWidth +
      sideGap +
      homeAbbrWidth +
      homeLogoPad +
      homeLogoWidth +
      scoreGap +
      homeScoreWidth;

    return {
      scorePx,
      teamPx,
      atPx,
      logoPx,
      scoreGap,
      logoGap,
      sideGap,
      awayScoreWidth,
      homeScoreWidth,
      awayAbbrWidth,
      homeAbbrWidth,
      atWidth,
      totalWidth,
      scaledScoreFont,
      scaledTeamFont,
      scaledAtFont,
    };
  };

  let resolvedLayout = measureLayout(1);
  if (resolvedLayout.totalWidth > maxHeaderWidth) {
    for (let scale = 0.96; scale >= 0.72; scale -= 0.04) {
      const nextLayout = measureLayout(scale);
      resolvedLayout = nextLayout;
      if (nextLayout.totalWidth <= maxHeaderWidth) {
        break;
      }
    }
  }

  const {
    scoreGap,
    logoGap,
    sideGap,
    logoPx,
    awayScoreWidth,
    awayAbbrWidth,
    homeAbbrWidth,
    atWidth,
    totalWidth,
    scaledScoreFont,
    scaledTeamFont,
    scaledAtFont,
  } = resolvedLayout;
  let x = Math.max(6, (contentWidth - totalWidth) / 2);

  if (hasDate) {
    const dateMidY = y + HEADER_TOP_PADDING + HEADER_DATE_HEIGHT / 2;
    ctx.fillStyle = textSecondary;
    ctx.font = dateFont;
    const dateWidth = ctx.measureText(formattedGameDate).width;
    ctx.fillText(formattedGameDate, (contentWidth - dateWidth) / 2, dateMidY);
  }

  ctx.fillStyle = textPrimary;
  ctx.font = scaledScoreFont;
  ctx.fillText(awayScore, x, rowMidY);
  x += awayScoreWidth + scoreGap;

  if (hasAwayLogo) {
    try {
      ctx.drawImage(teamLogos.away, x, rowMidY - logoPx / 2, logoPx, logoPx);
    } catch (_err) {
      // Ignore logo draw errors.
    }
    x += logoPx + logoGap;
  }

  ctx.fillStyle = textPrimary;
  ctx.font = scaledTeamFont;
  ctx.fillText(awayAbbr, x, rowMidY);
  x += awayAbbrWidth + sideGap;

  ctx.fillStyle = textSecondary;
  ctx.font = scaledAtFont;
  ctx.fillText(atLabel, x, rowMidY);
  x += atWidth + sideGap;

  ctx.fillStyle = textPrimary;
  ctx.font = scaledTeamFont;
  ctx.fillText(homeAbbr, x, rowMidY);
  x += homeAbbrWidth;

  if (hasHomeLogo) {
    x += logoGap;
    try {
      ctx.drawImage(teamLogos.home, x, rowMidY - logoPx / 2, logoPx, logoPx);
    } catch (_err) {
      // Ignore logo draw errors.
    }
    x += logoPx;
  }

  x += scoreGap;
  ctx.fillStyle = textPrimary;
  ctx.font = scaledScoreFont;
  ctx.fillText(homeScore, x, rowMidY);

  const statusText = String(statusLabel || '').trim();
  let bottomY = rowTop + HEADER_ROW_HEIGHT;
  if (statusText) {
    const statusY = bottomY + HEADER_STATUS_GAP + HEADER_STATUS_HEIGHT / 2;
    ctx.fillStyle = textSecondary;
    ctx.font = statusFont;
    const statusWidth = ctx.measureText(statusText).width;
    ctx.fillText(statusText, (contentWidth - statusWidth) / 2, statusY);
    bottomY = statusY + HEADER_STATUS_HEIGHT / 2;
  }

  bottomY += HEADER_BOTTOM_PADDING;
  ctx.restore();
  return { bottomY };
};

const fitLineWithEllipsis = ({ ctx, text, maxWidth }) => {
  if (!ctx || !text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = String(text);
  while (trimmed && ctx.measureText(`${trimmed}...`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed ? `${trimmed}...` : '...';
};

const wrapCaptionLines = ({ ctx, text, maxWidth, maxLines }) => {
  const normalized = String(text || '').trim();
  if (!ctx || !normalized || maxWidth <= 0 || maxLines <= 0) return [];
  const words = normalized.split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines = [];
  let current = words[0];
  for (let index = 1; index < words.length; index += 1) {
    const candidate = `${current} ${words[index]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = words[index];
    if (lines.length === maxLines) {
      break;
    }
  }
  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  const hasOverflow = lines.length === maxLines && words.join(' ').length > lines.join(' ').length;
  if (hasOverflow) {
    const lastIndex = lines.length - 1;
    lines[lastIndex] = fitLineWithEllipsis({
      ctx,
      text: lines[lastIndex],
      maxWidth,
    });
  }
  return lines;
};

export const measureCaptionBlockHeight = ({
  measureCtx,
  text,
  maxWidth,
  font = '500 13px system-ui, -apple-system, sans-serif',
  lineHeight = 18,
  maxLines = 3,
  paddingTop = 2,
  paddingBottom = 2,
}) => {
  if (!measureCtx || !text || maxWidth <= 0) return 0;
  measureCtx.save();
  measureCtx.font = font;
  const lines = wrapCaptionLines({ ctx: measureCtx, text, maxWidth, maxLines });
  measureCtx.restore();
  if (!lines.length) return 0;
  return paddingTop + lines.length * lineHeight + paddingBottom;
};

export const measurePlayerFocusHeaderHeight = ({
  playerLabel,
  teamAbbr,
  labelText = '',
  labelLineHeight = 12,
  nameLineHeight = 22,
  gap = 2,
  paddingTop = 2,
  paddingBottom = 2,
}) => {
  const hasPlayer = Boolean(String(playerLabel || '').trim());
  const hasTeam = Boolean(String(teamAbbr || '').trim());
  if (!hasPlayer && !hasTeam) return 0;
  const hasLabel = Boolean(String(labelText || '').trim());
  return paddingTop + (hasLabel ? labelLineHeight + gap : 0) + nameLineHeight + paddingBottom;
};

export const drawPlayerFocusHeader = ({
  ctx,
  contentWidth,
  y,
  playerLabel,
  teamAbbr,
  textPrimary,
  textSecondary,
  sidePadding = 12,
  labelText = '',
  labelFont = '700 10px system-ui, -apple-system, sans-serif',
  nameFontFamily = 'system-ui, -apple-system, sans-serif',
  nameFontWeight = '700',
  nameMaxFontSize = 19,
  nameMinFontSize = 13,
  labelLineHeight = 12,
  nameLineHeight = 22,
  gap = 2,
  paddingTop = 2,
  paddingBottom = 2,
}) => {
  if (!ctx) return 0;
  const playerText = String(playerLabel || '').trim();
  const teamText = String(teamAbbr || '').trim();
  if (!playerText && !teamText) return 0;

  const focusText = teamText ? `${playerText} (${teamText})` : playerText;
  const maxWidth = Math.max(1, contentWidth - sidePadding * 2);
  const totalHeight = measurePlayerFocusHeaderHeight({
    playerLabel: playerText,
    teamAbbr: teamText,
    labelText,
    labelLineHeight,
    nameLineHeight,
    gap,
    paddingTop,
    paddingBottom,
  });

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const hasLabel = Boolean(String(labelText || '').trim());
  let nameY = y + paddingTop;
  if (hasLabel) {
    ctx.fillStyle = textSecondary;
    ctx.font = labelFont;
    ctx.fillText(labelText, contentWidth / 2, y + paddingTop);
    nameY += labelLineHeight + gap;
  }

  let resolvedFontSize = nameMaxFontSize;
  ctx.fillStyle = textPrimary;
  ctx.font = `${nameFontWeight} ${resolvedFontSize}px ${nameFontFamily}`;
  while (resolvedFontSize > nameMinFontSize && ctx.measureText(focusText).width > maxWidth) {
    resolvedFontSize -= 1;
    ctx.font = `${nameFontWeight} ${resolvedFontSize}px ${nameFontFamily}`;
  }
  const fittedText =
    ctx.measureText(focusText).width > maxWidth
      ? fitLineWithEllipsis({ ctx, text: focusText, maxWidth })
      : focusText;
  ctx.fillText(fittedText, contentWidth / 2, nameY);

  ctx.restore();
  return totalHeight;
};

export const drawCaptionBlock = ({
  ctx,
  text,
  x,
  y,
  maxWidth,
  color,
  font = '500 13px system-ui, -apple-system, sans-serif',
  lineHeight = 18,
  maxLines = 3,
  paddingTop = 2,
  textAlign = 'left',
}) => {
  if (!ctx || !text || maxWidth <= 0) return 0;
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textBaseline = 'top';
  ctx.textAlign = textAlign;
  const lines = wrapCaptionLines({ ctx, text, maxWidth, maxLines });
  if (!lines.length) {
    ctx.restore();
    return 0;
  }
  const drawX =
    textAlign === 'center' ? x + maxWidth / 2 : textAlign === 'right' ? x + maxWidth : x;
  lines.forEach((line, index) => {
    ctx.fillText(line, drawX, y + paddingTop + index * lineHeight);
  });
  ctx.restore();
  return paddingTop + lines.length * lineHeight;
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
