import { useEffect, useRef, useMemo, useState } from 'react';
import html2canvas from 'html2canvas';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme } from '../hooks/useTheme'; // Adjust path
import { getMatchupColors, getSafeBackground } from '../../helpers/teamColors'; // Adjust path
import { useMinimumLoadingState } from '../hooks/useMinimumLoadingState';
import { getGameTotalSeconds, getPeriodDurationSeconds, getPeriodStartSeconds, getSecondsElapsed } from '../../helpers/playTimeline';
import { buildNbaEventUrl, resolveVideoAction } from '../../helpers/nbaEvents';
import { EVENT_TYPES, getEventType, isFreeThrowAction } from '../../helpers/eventStyles.jsx';

// Sub-components
import Player from './Player/Player';
import ScoreGraph from './ScoreGraph';
import PlayTooltip from './PlayTooltip';
import TimelineGrid from './TimelineGrid'; 

// Custom Hook
import { usePlayInteraction } from './usePlayInteraction';

import './Play.scss';

const LOADING_TEXT_DELAY_MS = 500;
const MIN_BLUR_MS = 300;
const TOUCH_AXIS_LOCK_PX = 8;
const QUARTER_VIEW_BREAKPOINT = 700;

const findActionMetaFromTarget = (targetEl, containerEl) => {
  let checkEl = targetEl;
  while (checkEl && checkEl !== containerEl) {
    if (checkEl.dataset) {
      const actionNumber = checkEl.dataset.actionNumber ?? null;
      const actionId = checkEl.dataset.actionId ?? null;
      if (actionNumber || actionId) {
        return { actionNumber, actionId };
      }
    }
    if (checkEl.tagName === 'svg') break;
    checkEl = checkEl.parentElement;
  }
  return null;
};

const hasPlayData = (data) => Boolean(
  data &&
  (
    (data.allActions && data.allActions.length) ||
    (data.scoreTimeline && data.scoreTimeline.length) ||
    Object.keys(data.awayPlayers || {}).length ||
    Object.keys(data.homePlayers || {}).length
  )
);

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

const EXPORT_PADDING_PX = {
  top: 24,
  right: 24,
  bottom: 28,
  left: 24
};
const DESKTOP_EXPORT_WIDTH = 1235;
const EXPORT_TIMEOUT_MS = 15000;
const MOBILE_EXPORT_MAX_WIDTH = 1024;

const buildPaddedCanvas = (sourceCanvas, padding, backgroundColor, scale) => {
  const padLeft = Math.round((padding.left || 0) * scale);
  const padRight = Math.round((padding.right || 0) * scale);
  const padTop = Math.round((padding.top || 0) * scale);
  const padBottom = Math.round((padding.bottom || 0) * scale);
  const output = document.createElement('canvas');
  output.width = sourceCanvas.width + padLeft + padRight;
  output.height = sourceCanvas.height + padTop + padBottom;
  const ctx = output.getContext('2d');
  if (!ctx) {
    return sourceCanvas;
  }
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, output.width, output.height);
  ctx.drawImage(sourceCanvas, padLeft, padTop);
  return output;
};

const waitForNextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

const withTimeout = (promise, ms, label) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

const dataUrlToBlob = (dataUrl) => {
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

const canvasToBlob = (canvas) => {
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

const getExportScale = (target, shouldForceDesktopLayout, isMobileViewport) => {
  if (!target) return 1;
  const rect = target.getBoundingClientRect();
  const baseScale = Math.min(3, window.devicePixelRatio || 1);
  const maxPixels = isMobileViewport
    ? 2_500_000
    : (shouldForceDesktopLayout ? 3_000_000 : 6_000_000);
  const area = Math.max(1, rect.width * rect.height);
  const scaleByArea = Math.sqrt(maxPixels / area);
  const maxScale = isMobileViewport ? 1 : 2;
  const minScale = isMobileViewport ? 0.75 : 1;
  return Math.max(minScale, Math.min(baseScale, scaleByArea, maxScale));
};

export default function Play({ 
  gameId,
  gameStatus,
  awayTeamNames, 
  homeTeamNames, 
  awayPlayers, 
  homePlayers, 
  allActions, 
  scoreTimeline, 
  awayPlayerTimeline, 
  homePlayerTimeline, 
  numQs, 
  sectionWidth, 
  lastAction, 
  isLoading, 
  statusMessage, 
  showScoreDiff = true 
}) {
  const playRef = useRef(null);
  const appliedGameIdRef = useRef(gameId);
  const pendingGameChangeRef = useRef(false);
  const lastStableRef = useRef({
    awayTeamNames,
    homeTeamNames,
    awayPlayers,
    homePlayers,
    allActions,
    scoreTimeline,
    awayPlayerTimeline,
    homePlayerTimeline,
    numQs,
    lastAction,
  });
  const lastStatusMessageRef = useRef(statusMessage);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const touchAxisRef = useRef(null);
  const touchMovedRef = useRef(false);
  const touchClickGuardUntilRef = useRef(0);
  const userSelectedPeriodRef = useRef(false);
  const [showLoadingText, setShowLoadingText] = useState(false);
  const [isHoveringIcon, setIsHoveringIcon] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportPreview, setExportPreview] = useState(null);
  const [exportError, setExportError] = useState(null);
  const exportPreviewUrlRef = useRef(null);
  const [canOpenVideoOnClick, setCanOpenVideoOnClick] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(hover: hover) and (pointer: fine)').matches
      : true
  ));
  const { isDarkMode } = useTheme();
  const isBlurred = useMinimumLoadingState(isLoading, MIN_BLUR_MS);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return undefined;
    }
    const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    const handleChange = (event) => setCanOpenVideoOnClick(event.matches);

    setCanOpenVideoOnClick(mediaQuery.matches);
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  const setExportPreviewState = (next) => {
    if (exportPreviewUrlRef.current && typeof URL !== 'undefined') {
      URL.revokeObjectURL(exportPreviewUrlRef.current);
    }
    exportPreviewUrlRef.current = next?.url || null;
    setExportPreview(next);
  };

  useEffect(() => () => {
    if (exportPreviewUrlRef.current && typeof URL !== 'undefined') {
      URL.revokeObjectURL(exportPreviewUrlRef.current);
    }
  }, []);

  useEffect(() => {
    if (isLoading || isBlurred) {
      return;
    }
    lastStableRef.current = {
      awayTeamNames,
      homeTeamNames,
      awayPlayers,
      homePlayers,
      allActions,
      scoreTimeline,
      awayPlayerTimeline,
      homePlayerTimeline,
      numQs,
      lastAction,
    };
  }, [
    isLoading,
    isBlurred,
    awayTeamNames,
    homeTeamNames,
    awayPlayers,
    homePlayers,
    allActions,
    scoreTimeline,
    awayPlayerTimeline,
    homePlayerTimeline,
    numQs,
    lastAction,
  ]);

  useEffect(() => {
    if (isLoading || isBlurred) {
      return;
    }
    lastStatusMessageRef.current = statusMessage;
  }, [statusMessage, isLoading, isBlurred]);

  const showStableData = (isLoading || isBlurred) && lastStableRef.current;
  const displayData = showStableData
    ? lastStableRef.current
    : {
      awayTeamNames,
      homeTeamNames,
      awayPlayers,
      homePlayers,
      allActions,
      scoreTimeline,
      awayPlayerTimeline,
      homePlayerTimeline,
      numQs,
      lastAction,
    };
  const isShowingStableData = Boolean(showStableData);

  const {
    awayTeamNames: displayAwayTeamNames,
    homeTeamNames: displayHomeTeamNames,
    awayPlayers: displayAwayPlayers,
    homePlayers: displayHomePlayers,
    allActions: displayAllActions,
    scoreTimeline: displayScoreTimeline,
    awayPlayerTimeline: displayAwayPlayerTimeline,
    homePlayerTimeline: displayHomePlayerTimeline,
    numQs: displayNumQs,
    lastAction: displayLastAction,
  } = displayData;

  const hasDisplayData = hasPlayData(displayData);
  const hasIncomingData = hasPlayData({
    allActions,
    scoreTimeline,
    awayPlayers,
    homePlayers,
  });
  const displayStatusMessage = (isLoading || isBlurred) ? lastStatusMessageRef.current : statusMessage;
  const showStatusMessage = Boolean(displayStatusMessage) && !hasDisplayData;
  const isDataLoading = isBlurred && (hasDisplayData || hasIncomingData || showStatusMessage);

  useEffect(() => {
    if (isLoading && hasDisplayData) {
      const timer = setTimeout(() => setShowLoadingText(true), LOADING_TEXT_DELAY_MS);
      return () => clearTimeout(timer);
    }
    setShowLoadingText(false);
  }, [isLoading, hasDisplayData]);

  const showLoadingOverlay = isLoading && hasDisplayData && showLoadingText;

  // --- Layout Constants ---
  const leftMargin = 96;
  const rightMargin = 10;
  // Timeline draw width excludes margins
  const width = Math.max(0, sectionWidth - (leftMargin + rightMargin));

  // Calculate Quarter Width (Dynamic based on Overtime)
  const qWidth = useMemo(() => {
    if (displayNumQs > 4) {
      return width * (12 / (12 * 4 + 5 * (displayNumQs - 4)));
    }
    return width / 4;
  }, [width, displayNumQs]);

  const numPeriods = Number(displayNumQs) || 0;
  const isQuarterView = sectionWidth > 0 && sectionWidth < QUARTER_VIEW_BREAKPOINT;

  const periodOptions = useMemo(() => {
    if (numPeriods <= 0) return [];
    const options = [{ period: 0, label: 'Game' }];
    for (let i = 0; i < numPeriods; i += 1) {
      const period = i + 1;
      options.push({
        period,
        label: period <= 4 ? `Q${period}` : `O${period - 4}`,
      });
    }
    return options;
  }, [numPeriods]);

  const isFinal = useMemo(() => {
    if (typeof gameStatus === 'string' && gameStatus.trim().startsWith('Final')) {
      return true;
    }
    const status = displayLastAction?.status;
    return typeof status === 'string' && status.trim().startsWith('Final');
  }, [displayLastAction?.status, gameStatus]);

  const defaultPeriod = useMemo(() => {
    if (isFinal) return 1;
    const fallback = Number(displayLastAction?.period || numPeriods || 4);
    if (!Number.isFinite(fallback) || fallback <= 0) return 1;
    return numPeriods > 0 ? Math.min(fallback, numPeriods) : fallback;
  }, [displayLastAction?.period, numPeriods, isFinal]);

  const hasPeriodData = useMemo(() => {
    const period = Number(displayLastAction?.period);
    return Number.isFinite(period) && period > 0;
  }, [displayLastAction?.period]);

  const [selectedPeriod, setSelectedPeriod] = useState(null);

  useEffect(() => {
    if (gameId === appliedGameIdRef.current) return;
    appliedGameIdRef.current = gameId;
    pendingGameChangeRef.current = true;
    userSelectedPeriodRef.current = false;
    setExportPreviewState(null);
    setExportError(null);
  }, [gameId]);

  useEffect(() => {
    if (!pendingGameChangeRef.current) return;
    if (isShowingStableData) return;
    pendingGameChangeRef.current = false;
    setSelectedPeriod(defaultPeriod);
  }, [isShowingStableData, defaultPeriod]);

  useEffect(() => {
    if (!isQuarterView || numPeriods <= 0) return;
    if (pendingGameChangeRef.current) return;
    if (!hasPeriodData && !isFinal) return;
    setSelectedPeriod((prev) => {
      if (prev === 0) return 0;
      const prevValid = Number.isFinite(prev) && prev > 0 && prev <= numPeriods;
      if (userSelectedPeriodRef.current && prevValid) return prev;
      return defaultPeriod;
    });
  }, [isQuarterView, numPeriods, defaultPeriod, hasPeriodData, isFinal]);

  const resolvedSelectedPeriod = pendingGameChangeRef.current && !isShowingStableData
    ? defaultPeriod
    : selectedPeriod;
  const activePeriod = isQuarterView ? (resolvedSelectedPeriod !== null ? resolvedSelectedPeriod : defaultPeriod) : null;
  const isQuarterFocus = isQuarterView && activePeriod !== 0;
  const activePeriodLabel = isQuarterFocus
    ? (activePeriod <= 4 ? `Q${activePeriod}` : `O${activePeriod - 4}`)
    : '';

  const timelineWindow = useMemo(() => {
    const totalSeconds = getGameTotalSeconds(numPeriods);
    if (!activePeriod) {
      return { startSeconds: 0, durationSeconds: totalSeconds };
    }
    return {
      startSeconds: getPeriodStartSeconds(activePeriod),
      durationSeconds: getPeriodDurationSeconds(activePeriod),
    };
  }, [activePeriod, numPeriods]);

  const filteredAllActions = useMemo(() => {
    if (!activePeriod) return displayAllActions || [];
    return (displayAllActions || []).filter((action) => Number(action.period) === activePeriod);
  }, [displayAllActions, activePeriod]);

  const filteredScoreTimeline = useMemo(() => {
    if (!activePeriod) return displayScoreTimeline || [];
    return (displayScoreTimeline || []).filter((action) => Number(action.period) === activePeriod);
  }, [displayScoreTimeline, activePeriod]);

  const filteredAwayPlayers = useMemo(() => {
    if (!activePeriod) return displayAwayPlayers || {};
    return Object.fromEntries(
      Object.entries(displayAwayPlayers || {}).map(([name, actions]) => [
        name,
        (actions || []).filter((action) => Number(action.period) === activePeriod),
      ])
    );
  }, [displayAwayPlayers, activePeriod]);

  const filteredHomePlayers = useMemo(() => {
    if (!activePeriod) return displayHomePlayers || {};
    return Object.fromEntries(
      Object.entries(displayHomePlayers || {}).map(([name, actions]) => [
        name,
        (actions || []).filter((action) => Number(action.period) === activePeriod),
      ])
    );
  }, [displayHomePlayers, activePeriod]);

  const filteredAwayPlayerTimeline = useMemo(() => {
    if (!activePeriod) return displayAwayPlayerTimeline || {};
    return Object.fromEntries(
      Object.entries(displayAwayPlayerTimeline || {}).map(([name, timeline]) => [
        name,
        (timeline || []).filter((entry) => Number(entry.period) === activePeriod),
      ])
    );
  }, [displayAwayPlayerTimeline, activePeriod]);

  const filteredHomePlayerTimeline = useMemo(() => {
    if (!activePeriod) return displayHomePlayerTimeline || {};
    return Object.fromEntries(
      Object.entries(displayHomePlayerTimeline || {}).map(([name, timeline]) => [
        name,
        (timeline || []).filter((entry) => Number(entry.period) === activePeriod),
      ])
    );
  }, [displayHomePlayerTimeline, activePeriod]);

  const filteredLastAction = useMemo(() => {
    if (!activePeriod) return displayLastAction;
    if (!filteredAllActions.length) return null;
    return filteredAllActions[filteredAllActions.length - 1];
  }, [activePeriod, filteredAllActions, displayLastAction]);

  const startScoreDiff = useMemo(() => {
    if (!activePeriod) return 0;
    const startSeconds = getPeriodStartSeconds(activePeriod);
    let diff = 0;
    (displayScoreTimeline || []).forEach((entry) => {
      const elapsed = getSecondsElapsed(entry.period, entry.clock);
      if (elapsed <= startSeconds) {
        diff = Number(entry.away) - Number(entry.home);
      }
    });
    return diff;
  }, [activePeriod, displayScoreTimeline]);

  const latestStartedPeriod = Number(displayLastAction?.period || 0);

  // --- Custom Hook for Logic ---
  const {
    descriptionArray,
    mouseLinePos,
    highlightActionIds,
    focusActionMeta,
    infoLocked,
    hasPrevAction,
    hasNextAction,
    navigateAction,
    setInfoLocked,
    mousePosition,
    setMousePosition,
    setMouseLinePos,
    setDescriptionArray,
    setHighlightActionIds,
    updateHoverAt,
    resetInteraction
  } = usePlayInteraction({
    leftMargin,
    timelineWidth: width,
    timelineWindow,
    allActions: filteredAllActions,
    playRef
  });

  useEffect(() => {
    setInfoLocked(false);
    setMouseLinePos(null);
    setDescriptionArray([]);
    setHighlightActionIds([]);
  }, [activePeriod, setInfoLocked, setMouseLinePos, setDescriptionArray, setHighlightActionIds]);

  // --- Visual Data Prep ---
  const teamColors = getMatchupColors(displayAwayTeamNames.abr, displayHomeTeamNames.abr, isDarkMode);
  
  const awayColor = teamColors.away ? getSafeBackground(teamColors.away, isDarkMode) : '';
  const homeColor = teamColors.home ? getSafeBackground(teamColors.home, isDarkMode) : '';

  // Max Score Lead & Y-Axis Scale
  const { maxLead, maxY } = useMemo(() => {
    let max = 0;
    if (displayScoreTimeline) {
      displayScoreTimeline.forEach(t => {
        const scoreDiff = Math.abs(Number(t.away) - Number(t.home));
        if (scoreDiff > max) max = scoreDiff;
      });
    }
    return {
      maxLead: max,
      // Round to nearest 5 and add padding for the chart ceiling
      maxY: Math.floor(max / 5) * 5 + 10
    };
  }, [displayScoreTimeline]);


  // --- Event Handlers ---
  const handleMouseMove = (e) => {
    const actionMeta = findActionMetaFromTarget(e.target, playRef.current);
    setIsHoveringIcon(Boolean(actionMeta?.actionNumber || actionMeta?.actionId));
    updateHoverAt(e.clientX, e.clientY, e.target);
  };

  const handleClick = (e) => {
    if (Date.now() < touchClickGuardUntilRef.current) {
      return;
    }
    const actionMeta = findActionMetaFromTarget(e.target, playRef.current);
    const actionNumber = actionMeta?.actionNumber ?? null;
    const actionId = actionMeta?.actionId ?? null;
    if ((actionNumber || actionId) && canOpenVideoOnClick) {
      let action = null;
      if (actionId) {
        action = (displayAllActions || []).find(
          (entry) => String(entry.actionId) === String(actionId)
        );
      }
      if (!action && actionNumber) {
        action = (displayAllActions || []).find(
          (entry) => String(entry.actionNumber) === String(actionNumber)
        );
      }
      const targetAction = resolveVideoAction(action, displayAllActions);
      const url = buildNbaEventUrl({
        gameId,
        actionNumber: targetAction?.actionNumber ?? action?.actionNumber ?? actionNumber ?? actionId,
        description: targetAction?.description ?? action?.description,
      });
      if (url && typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener');
        return;
      }
    }
    if (!infoLocked) {
      setInfoLocked(true);
      setMousePosition({ x: e.clientX, y: e.clientY });
    } else {
      setInfoLocked(false);
      if (!canOpenVideoOnClick) {
        resetInteraction(true);
      } else {
        resetInteraction();
      }
    }
  };

  const handleTouchStart = (e) => {
    if (isDataLoading || !e.touches[0]) return;
    touchAxisRef.current = null;
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    touchMovedRef.current = false;
    resetInteraction();
  };

  const handleTouchMove = (e) => {
    if (isDataLoading || !e.touches[0]) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (!touchAxisRef.current) {
      if (absDx < TOUCH_AXIS_LOCK_PX && absDy < TOUCH_AXIS_LOCK_PX) {
        return;
      }
      touchAxisRef.current = absDx >= absDy ? 'horizontal' : 'vertical';
      touchMovedRef.current = true;
    }

    if (touchAxisRef.current === 'vertical') {
      if (!infoLocked) {
        resetInteraction();
      }
      return;
    }

    const wasLocked = infoLocked;
    if (wasLocked) {
      setInfoLocked(false);
    }
    touchMovedRef.current = true;
    e.preventDefault();
    updateHoverAt(touch.clientX, touch.clientY, e.target, wasLocked);
  };

  const handleTouchEnd = () => {
    if (isDataLoading) return;
    if (touchMovedRef.current) {
      const shouldLock = touchAxisRef.current === 'horizontal' && descriptionArray.length > 0;
      touchClickGuardUntilRef.current = Date.now() + 200;
      if (!infoLocked) {
        if (shouldLock) {
          setInfoLocked(true);
        } else {
          resetInteraction();
        }
      }
    }
    touchAxisRef.current = null;
    touchMovedRef.current = false;
  };

  const handleTouchCancel = () => {
    if (isDataLoading) return;
    touchClickGuardUntilRef.current = Date.now() + 200;
    if (!infoLocked) {
      resetInteraction();
    }
    touchAxisRef.current = null;
    touchMovedRef.current = false;
  };

  const showQuarterSwitcher = isQuarterView && periodOptions.length > 0 && hasDisplayData;
  const quarterSwitcher = showQuarterSwitcher ? (
    <div className="playQuarterSwitcher" style={{ width: sectionWidth }}>
      {periodOptions.map(({ period, label }) => (
        <button
          key={period}
          type="button"
          className={`quarterTab ${period === activePeriod ? 'isActive' : ''}`}
          onClick={() => {
            userSelectedPeriodRef.current = true;
            setSelectedPeriod(period);
          }}
          disabled={isDataLoading || (period !== 0 && period > latestStartedPeriod)}
          aria-pressed={period === activePeriod}
        >
          {label}
        </button>
      ))}
    </div>
  ) : null;

  const buildLiteExportCanvas = () => {
    if (typeof window === 'undefined') return null;
    const baseWidth = DESKTOP_EXPORT_WIDTH;
    const leftPad = leftMargin;
    const rightPad = rightMargin;
    const headerHeight = 54;
    const footerHeight = 32;
    const chartHeight = 360;
    const chartTop = headerHeight + 8;
    const chartLeft = leftPad;
    const chartWidth = Math.max(1, baseWidth - chartLeft - rightPad);
    const baseHeight = chartTop + chartHeight + footerHeight;
    const scale = Math.min(2, window.devicePixelRatio || 1);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(baseWidth * scale);
    canvas.height = Math.round(baseHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(scale, scale);

    const backgroundColor = resolveExportBackground(playRef.current);
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, baseWidth, baseHeight);

    const styleSource = playRef.current || document.documentElement;
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
    const periodLabel = isQuarterFocus
      ? (activePeriodLabel || `P${activePeriod}`)
      : 'Game';

    ctx.fillStyle = textPrimary;
    ctx.font = '600 18px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${awayLabel} vs ${homeLabel}`, chartLeft, 24);
    ctx.fillStyle = textSecondary;
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    ctx.fillText(periodLabel, chartLeft, 42);

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
      ctx.fillText(scoreText, baseWidth - 20 - textWidth, 24);
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

    return canvas;
  };

  const buildFullExportCanvas = () => {
    if (typeof window === 'undefined') return null;
    const baseWidth = DESKTOP_EXPORT_WIDTH;
    const leftPad = leftMargin;
    const rightPad = rightMargin;
    const headerHeight = 32;
    const playAreaTop = headerHeight + 8;
    const teamLabelHeight = 18;
    const teamSectionHeight = 275;
    const playAreaHeight = 600;
    const chartHeight = playAreaHeight;
    const chartTop = playAreaTop;
    const chartLeft = leftPad;
    const chartWidth = Math.max(1, baseWidth - chartLeft - rightPad);

    const awayNames = Object.keys(filteredAwayPlayers || {});
    const homeNames = Object.keys(filteredHomePlayers || {});
    const awayRowHeight = teamSectionHeight / Math.max(1, awayNames.length);
    const homeRowHeight = teamSectionHeight / Math.max(1, homeNames.length);
    const awaySectionHeight = teamSectionHeight;
    const homeSectionHeight = teamSectionHeight;

    const baseHeight = playAreaTop + playAreaHeight + 16;

    const scale = Math.min(2, window.devicePixelRatio || 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(baseWidth * scale);
    canvas.height = Math.round(baseHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(scale, scale);

    const backgroundColor = resolveExportBackground(playRef.current);
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, baseWidth, baseHeight);

    const styleSource = playRef.current || document.documentElement;
    const computed = window.getComputedStyle(styleSource);
    const textPrimary = getCssVar(computed, '--text-primary', '#111111');
    const textSecondary = getCssVar(computed, '--text-secondary', '#6b7280');
    const lineColor = getCssVar(computed, '--line-color', '#cbd5f5');
    const lineLight = getCssVar(computed, '--line-color-light', '#94a3b8');
    const quarterLabelColor = getCssVar(computed, '--quarter-label-color', '#6b7280');
    const awayLabel = displayAwayTeamNames?.abr || 'Away';
    const homeLabel = displayHomeTeamNames?.abr || 'Home';
    const periodLabel = isQuarterFocus
      ? (activePeriodLabel || `P${activePeriod}`)
      : 'Game';

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = textPrimary;
    ctx.font = '600 16px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${awayLabel} vs ${homeLabel}`, chartLeft, 22);
    ctx.fillStyle = textSecondary;
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    ctx.fillText(periodLabel, chartLeft, 38);

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
      ctx.fillText(scoreText, baseWidth - rightPad - textWidth, 22);
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

    if (isQuarterFocus && activePeriodLabel) {
      ctx.fillStyle = quarterLabelColor;
      ctx.font = '600 10px system-ui, -apple-system, sans-serif';
      const x = chartLeft + chartWidth / 2;
      ctx.fillText(activePeriodLabel, x - ctx.measureText(activePeriodLabel).width / 2, chartTop + 10);
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
        ctx.fillStyle = teamColors.away;
        ctx.fillText(`${value}`, chartLeft + chartWidth + 4, posy + 3);

        ctx.strokeStyle = teamColors.home;
        ctx.beginPath();
        ctx.moveTo(chartLeft, negy);
        ctx.lineTo(chartLeft + chartWidth, negy);
        ctx.stroke();
        ctx.fillStyle = teamColors.home;
        ctx.fillText(`${value}`, chartLeft + chartWidth + 4, negy + 3);
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

    return canvas;
  };

  const buildExportFileName = () => {
    const away = displayAwayTeamNames?.abr || 'Away';
    const home = displayHomeTeamNames?.abr || 'Home';
    const periodLabel = isQuarterFocus
      ? (activePeriodLabel || `P${activePeriod}`)
      : 'Game';
    const base = `${away}-vs-${home}-${periodLabel}`;
    const safeBase = sanitizeFilePart(base) || 'play-by-play';
    const suffix = gameId ? `-${sanitizeFilePart(gameId)}` : '';
    return `${safeBase}${suffix}.png`;
  };

  const handleExportImage = async () => {
    if (!playRef.current || isExporting) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    setIsExporting(true);
    setExportPreviewState(null);
    setExportError(null);
    const isMobileViewport = Boolean(
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia(`(max-width: ${QUARTER_VIEW_BREAKPOINT}px)`).matches
    );
    const exportTarget = isMobileViewport
      ? playRef.current
      : (playRef.current.closest('.playByPlaySection') || playRef.current);
    const isTouchDevice = Boolean(
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(hover: none) and (pointer: coarse)').matches
    );
    const useDataExport = isMobileViewport || isTouchDevice;
    const shouldShowPreview = isTouchDevice || isMobileViewport;
    const exportDesktopWidth = isMobileViewport ? MOBILE_EXPORT_MAX_WIDTH : DESKTOP_EXPORT_WIDTH;
    const shouldForceDesktopLayout = Boolean(
      !isMobileViewport &&
      exportTarget &&
      activePeriod === 0 &&
      sectionWidth > 0 &&
      sectionWidth < exportDesktopWidth
    );
    const exportTimeoutMs = isMobileViewport ? 30000 : EXPORT_TIMEOUT_MS;
    let restoreBodyOverflow = null;
    try {
      setInfoLocked(false);
      setIsHoveringIcon(false);
      resetInteraction(true);

      if (!useDataExport && shouldForceDesktopLayout) {
        exportTarget.classList.add('isDesktopExport');
        restoreBodyOverflow = document.body.style.overflowX;
        document.body.style.overflowX = 'hidden';
        exportTarget.style.width = `${exportDesktopWidth}px`;
        exportTarget.style.maxWidth = 'none';
        for (let i = 0; i < 4; i += 1) {
          await waitForNextFrame();
        }
      } else if (!useDataExport) {
        await waitForNextFrame();
      }

      let outputCanvas = null;
      if (useDataExport) {
        outputCanvas = buildFullExportCanvas() || buildLiteExportCanvas();
      } else {
        const backgroundColor = resolveExportBackground(exportTarget);
        const scale = getExportScale(exportTarget, shouldForceDesktopLayout, isMobileViewport);
        const canvas = await withTimeout(html2canvas(exportTarget, {
          backgroundColor,
          scale,
          logging: false,
          useCORS: true,
          onclone: (doc) => {
            const clonedExportButton = doc.querySelector('.playExportButton');
            if (clonedExportButton) {
              clonedExportButton.style.display = 'none';
            }
            const clonedExportPreview = doc.querySelector('.playExportPreview');
            if (clonedExportPreview) {
              clonedExportPreview.style.display = 'none';
            }
            const clonedExportError = doc.querySelector('.playExportError');
            if (clonedExportError) {
              clonedExportError.style.display = 'none';
            }
            const clonedPlayers = doc.querySelectorAll('.play .player');
            clonedPlayers.forEach((player) => {
              player.style.display = 'grid';
              player.style.gridTemplateColumns = `${leftMargin}px 1fr`;
              player.style.alignItems = 'center';

              const name = player.querySelector('.playerName');
              if (name) {
                name.style.position = 'static';
                name.style.width = `${leftMargin}px`;
                name.style.gridColumn = '1';
              }
              const line = player.querySelector('svg.line');
              if (line) {
                line.style.position = 'static';
                line.style.left = '0px';
                line.style.marginLeft = '0px';
                line.style.gridColumn = '2';
                line.style.display = 'block';
              }
            });
          }
        }), exportTimeoutMs, 'Play export');

        outputCanvas = buildPaddedCanvas(canvas, EXPORT_PADDING_PX, backgroundColor, scale);
      }

      if (!outputCanvas) {
        throw new Error('Export failed: unable to build image.');
      }

      let blob = await withTimeout(canvasToBlob(outputCanvas), exportTimeoutMs, 'Play export image');
      if (!blob && outputCanvas.toDataURL) {
        blob = dataUrlToBlob(outputCanvas.toDataURL('image/png'));
      }

      if (!blob) {
        throw new Error('Export failed: image blob was empty.');
      }

      const fileName = buildExportFileName();
      let file = null;
      try {
        file = new File([blob], fileName, { type: 'image/png' });
      } catch (err) {
        setExportError('Share unavailable: File constructor failed on this device.');
      }
      let canShareFiles = false;
      if (file && typeof navigator !== 'undefined' && navigator.share) {
        if (!navigator.canShare) {
          canShareFiles = true;
        } else {
          try {
            canShareFiles = navigator.canShare({ files: [file] });
          } catch (err) {
            canShareFiles = false;
            setExportError('Share unavailable: browser rejected file sharing.');
          }
        }
      }

      if (shouldShowPreview) {
        const url = URL.createObjectURL(blob);
        setExportPreviewState({
          url,
          fileName,
          file,
          canShare: canShareFiles
        });
        return;
      }

      let shared = false;

      if (typeof navigator !== 'undefined' && navigator.share) {
        if (canShareFiles) {
          try {
            await navigator.share({
              files: [file],
              title: 'Play-by-play chart'
            });
            shared = true;
          } catch (err) {
            if (err?.name !== 'AbortError') {
              console.error('Play export share failed.', err);
            }
          }
        }
      }

      if (!shared) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 15000);
      }
    } catch (err) {
      const message = err?.message || 'Play export failed.';
      console.error('Play export failed.', err);
      setExportError(message);
    } finally {
      if (shouldForceDesktopLayout && exportTarget) {
        exportTarget.classList.remove('isDesktopExport');
        exportTarget.style.width = '';
        exportTarget.style.maxWidth = '';
        if (restoreBodyOverflow !== null) {
          document.body.style.overflowX = restoreBodyOverflow;
        }
      }
      setIsExporting(false);
    }
  };

  const handleSharePreview = async () => {
    if (!exportPreview?.file || !exportPreview?.canShare) return;
    if (typeof navigator === 'undefined' || !navigator.share) return;
    try {
      await navigator.share({
        files: [exportPreview.file],
        title: 'Play-by-play chart'
      });
      setExportPreviewState(null);
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('Play export share failed.', err);
      }
    }
  };

  const showLoadingIndicator = isLoading && !hasDisplayData && !showStatusMessage;
  const exportDisabled = !hasDisplayData || isDataLoading || isExporting;
  const exportButton = hasDisplayData ? (
    <button
      type="button"
      className="playExportButton"
      onClick={handleExportImage}
      disabled={exportDisabled}
      aria-label={isExporting ? 'Preparing image export' : 'Export image'}
      title={isExporting ? 'Preparing image...' : 'Export image'}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3v12" />
        <path d="M8 7l4-4 4 4" />
        <path d="M4 14v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" />
      </svg>
    </button>
  ) : null;
  const exportErrorPanel = exportError ? (
    <div className="playExportError" role="status" aria-live="polite">
      <span>{exportError}</span>
      <button
        type="button"
        className="playExportErrorDismiss"
        onClick={() => setExportError(null)}
        aria-label="Dismiss export error"
      >
        Dismiss
      </button>
    </div>
  ) : null;
  const exportPreviewPanel = exportPreview ? (
    <div className="playExportPreview" role="dialog" aria-label="Play-by-play image preview">
      <div className="playExportPreviewHeader">
        <span>Image ready</span>
        <button
          type="button"
          className="playExportPreviewClose"
          onClick={() => setExportPreviewState(null)}
          aria-label="Close image preview"
        >
          Close
        </button>
      </div>
      <div className="playExportPreviewBody">
        <img src={exportPreview.url} alt="Play-by-play export preview" />
      </div>
      <div className="playExportPreviewActions">
        {exportPreview.canShare && (
          <button
            type="button"
            className="playExportActionButton"
            onClick={handleSharePreview}
          >
            Share
          </button>
        )}
        <a
          className="playExportActionButton isLink"
          href={exportPreview.url}
          download={exportPreview.fileName}
          target="_blank"
          rel="noopener"
        >
          Open image
        </a>
      </div>
    </div>
  ) : null;

  // --- Render Loading/Error States ---
  if (showLoadingIndicator) {
    return (
      <div className="playWrapper">
        {quarterSwitcher}
        <div className='play'>
          <div className='loadingIndicator'>
            <CircularProgress size={24} thickness={5} />
            <span>Loading play-by-play...</span>
          </div>
        </div>
      </div>
    );
  }

  if (showStatusMessage) {
    return (
      <div className="playWrapper">
        {quarterSwitcher}
        <div className={`play ${isDataLoading ? 'isLoading' : ''}`}>
          <div className='playContent'>
            <div className='statusMessage'>{displayStatusMessage}</div>
          </div>
        </div>
      </div>
    );
  }

  // --- Main Render ---
  return (
    <div className="playWrapper">
      {quarterSwitcher}
      {exportButton}
      {exportErrorPanel}
      {exportPreviewPanel}
      <div
        ref={playRef}
        className={`play ${isDataLoading ? 'isLoading' : ''}`}
        style={{ width: sectionWidth }} // Use full section width including margins
        onMouseMove={isDataLoading ? undefined : handleMouseMove}
        onMouseLeave={isDataLoading ? undefined : () => {
          setIsHoveringIcon(false);
          resetInteraction();
        }}
        onClick={isDataLoading ? undefined : handleClick}
        // Touch support
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {/* Floating Tooltip */}
        {!isDataLoading && (
          <PlayTooltip 
            descriptionArray={descriptionArray}
            focusActionMeta={focusActionMeta}
            mousePosition={mousePosition}
            infoLocked={infoLocked}
            isHoveringIcon={isHoveringIcon}
            gameId={gameId}
            allActions={filteredAllActions}
            hasPrevAction={hasPrevAction}
            hasNextAction={hasNextAction}
            onNavigate={navigateAction}
            containerRef={playRef}
            awayTeamNames={displayAwayTeamNames}
            homeTeamNames={displayHomeTeamNames}
            teamColors={teamColors}
            leftMargin={leftMargin}
          />
        )}

        {showLoadingOverlay && (
          <div className='loadingOverlay'>
            <CircularProgress size={20} thickness={5} />
            <span>Loading play-by-play...</span>
          </div>
        )}

        <div className='playContent'>
          {/* Main SVG Visualization (Grid + Graph + MouseLine) */}
          <svg height="600" width={sectionWidth} className='line playGrid'>
            <TimelineGrid 
              width={width}
              leftMargin={leftMargin}
              qWidth={qWidth}
              numQs={displayNumQs}
              maxLead={maxLead}
              maxY={maxY}
              showScoreDiff={showScoreDiff}
              awayTeamName={displayAwayTeamNames.name}
              homeTeamName={displayHomeTeamNames.name}
              teamColors={teamColors}
              isQuarterView={isQuarterFocus}
              activePeriodLabel={activePeriodLabel}
            />
            
            <ScoreGraph 
              scoreTimeline={filteredScoreTimeline}
              lastAction={filteredLastAction}
              width={width}
              leftMargin={leftMargin}
              timelineWindow={timelineWindow}
              maxY={maxY}
              showScoreDiff={showScoreDiff}
              awayColor={awayColor}
              homeColor={homeColor}
              startScoreDiff={startScoreDiff}
            />

            {mouseLinePos !== null && (
              <line 
                x1={mouseLinePos} y1={10} 
                x2={mouseLinePos} y2={590} 
                style={{ stroke: 'var(--mouse-line-color)', strokeWidth: 1 }} 
              />
            )}
          </svg>

          {/* Player Rows - Away */}
          <div className="teamName" style={{color: teamColors.away}}>
            {displayAwayTeamNames.name}
          </div>
          <div className='teamSection'>
            {Object.keys(filteredAwayPlayers).map(name => (
              <Player 
                key={name} 
                actions={filteredAwayPlayers[name]} 
                timeline={filteredAwayPlayerTimeline[name]}
                name={name} 
                width={width} 
                rightMargin={rightMargin} 
                heightDivide={Object.keys(filteredAwayPlayers).length}
                highlight={highlightActionIds} 
                leftMargin={leftMargin}
                timelineWindow={timelineWindow}
              />
            ))}
          </div>

          {/* Player Rows - Home */}
          <div className="teamName" style={{color: teamColors.home}}>
            {displayHomeTeamNames.name}
          </div>
          <div className='teamSection'>
            {Object.keys(filteredHomePlayers).map(name => (
              <Player 
                key={name} 
                actions={filteredHomePlayers[name]} 
                timeline={filteredHomePlayerTimeline[name]}
                name={name} 
                width={width} 
                rightMargin={rightMargin} 
                heightDivide={Object.keys(filteredHomePlayers).length}
                highlight={highlightActionIds} 
                leftMargin={leftMargin}
                timelineWindow={timelineWindow}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
