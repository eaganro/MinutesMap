import { useEffect, useRef, useMemo, useState } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme } from '../hooks/useTheme'; // Adjust path
import { getMatchupColors, getSafeBackground } from '../../helpers/teamColors'; // Adjust path
import { useMinimumLoadingState } from '../hooks/useMinimumLoadingState';
import { getGameTotalSeconds, getPeriodDurationSeconds, getPeriodStartSeconds, getSecondsElapsed } from '../../helpers/playTimeline';
import { buildNbaEventUrl, resolveVideoAction } from '../../helpers/nbaEvents';
import {
  buildPlayExportCanvas,
  buildPlayExportFileName,
  canvasToBlob,
  dataUrlToBlob,
  DESKTOP_EXPORT_WIDTH,
  MOBILE_EXPORT_MAX_WIDTH,
} from './playExport';
import { buildExportRangeData, buildRangeLabel, formatPeriodLabel } from './playExportRange';
import { useExportRange } from './useExportRange';

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

const EXPORT_TIMEOUT_MS = 15000;

const withTimeout = (promise, ms, label) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

export default function Play({ 
  gameId,
  gameStatus,
  gameDate,
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
  showScoreDiff = true,
  statOn
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
    gameDate,
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
  const exportRangeKeyRef = useRef('1-1');
  const exportPreviewRef = useRef(null);
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
    setExportPreview((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      const nextUrl = resolved?.url || null;
      if (
        exportPreviewUrlRef.current &&
        exportPreviewUrlRef.current !== nextUrl &&
        typeof URL !== 'undefined'
      ) {
        URL.revokeObjectURL(exportPreviewUrlRef.current);
      }
      exportPreviewUrlRef.current = nextUrl;
      return resolved;
    });
  };

  useEffect(() => () => {
    if (exportPreviewUrlRef.current && typeof URL !== 'undefined') {
      URL.revokeObjectURL(exportPreviewUrlRef.current);
    }
  }, []);

  useEffect(() => {
    if (!exportPreview) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setExportPreviewState(null);
      }
    };
    const handlePointerDown = (event) => {
      if (!exportPreviewRef.current) return;
      if (!exportPreviewRef.current.contains(event.target)) {
        setExportPreviewState(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [exportPreview]);

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
      gameDate,
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
    gameDate,
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
      gameDate,
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
    gameDate: displayGameDate,
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
        label: formatPeriodLabel(period),
      });
    }
    return options;
  }, [numPeriods]);

  const exportPeriodOptions = useMemo(
    () => periodOptions.filter((option) => option.period > 0),
    [periodOptions]
  );

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

  const {
    resolvedExportRange,
    handleExportRangeStartChange,
    handleExportRangeEndChange,
  } = useExportRange({ gameId, numPeriods });
  const exportRangeKey = `${resolvedExportRange.start}-${resolvedExportRange.end}`;

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
  const activePeriodLabel = isQuarterFocus ? formatPeriodLabel(activePeriod) : '';

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

  const handleExportImage = async ({ keepPreviewOpen = false } = {}) => {
    if (!playRef.current || isExporting) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    setIsExporting(true);
    setExportPreviewState((prev) => {
      if (!keepPreviewOpen) return null;
      if (!prev) return prev;
      return { ...prev, isUpdating: true };
    });
    setExportError(null);
    const isMobileViewport = Boolean(
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia(`(max-width: ${QUARTER_VIEW_BREAKPOINT}px)`).matches
    );
    const shouldShowPreview = true;
    const exportTimeoutMs = isMobileViewport ? 30000 : EXPORT_TIMEOUT_MS;
    const exportRangeSnapshot = resolvedExportRange;
    exportRangeKeyRef.current = `${exportRangeSnapshot.start}-${exportRangeSnapshot.end}`;
    const exportIsFullGameRange = exportRangeSnapshot.isFullGame;
    const exportRangeLabel = buildRangeLabel(exportRangeSnapshot);
    const legendShouldWrap = !exportIsFullGameRange;
    const endAtLastScore = !isFinal;
    try {
      setInfoLocked(false);
      setIsHoveringIcon(false);
      resetInteraction(true);

      const {
        durationRatio,
        exportAwayPlayers,
        exportAwayPlayerTimeline,
        exportEndAtSeconds,
        exportHomePlayers,
        exportHomePlayerTimeline,
        exportScoreStats,
        exportScoreTimeline,
        exportStartScoreDiff,
        exportStatusLabel,
        exportTimelineWindow,
      } = buildExportRangeData({
        displayAwayPlayers,
        displayAwayPlayerTimeline,
        displayHomePlayers,
        displayHomePlayerTimeline,
        displayLastAction,
        displayScoreTimeline,
        exportRangeSnapshot,
        gameStatus,
        isFinal,
        numPeriods,
        timelineWindow,
      });
      const scaledWidth = DESKTOP_EXPORT_WIDTH * durationRatio;
      const dataExportWidth = exportIsFullGameRange
        ? DESKTOP_EXPORT_WIDTH
        : Math.max(360, Math.min(MOBILE_EXPORT_MAX_WIDTH, scaledWidth));

      const outputCanvas = buildPlayExportCanvas({
        exportWidth: dataExportWidth,
        legendShouldWrap,
        rangeLabel: exportRangeLabel,
        periodRange: exportRangeSnapshot,
        leftMargin,
        rightMargin,
        playRef,
        gameDate: displayGameDate,
        displayAwayTeamNames,
        displayHomeTeamNames,
        filteredAwayPlayers: exportAwayPlayers,
        filteredHomePlayers: exportHomePlayers,
        filteredAwayPlayerTimeline: exportAwayPlayerTimeline,
        filteredHomePlayerTimeline: exportHomePlayerTimeline,
        filteredScoreTimeline: exportScoreTimeline,
        displayScoreTimeline,
        statusLabel: exportStatusLabel,
        endAtLastScore,
        endAtSeconds: exportEndAtSeconds,
        startScoreDiff: exportStartScoreDiff,
        timelineWindow: exportTimelineWindow,
        maxY: exportScoreStats.maxY,
        maxLead: exportScoreStats.maxLead,
        showScoreDiff,
        statOn,
        teamColors,
        awayColor,
        homeColor,
      });

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

      const fileName = buildPlayExportFileName({
        awayTeamNames: displayAwayTeamNames,
        homeTeamNames: displayHomeTeamNames,
        rangeLabel: exportRangeLabel,
        isFullGameRange: exportIsFullGameRange,
        gameId,
      });
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
          canShare: canShareFiles,
          isUpdating: false
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
      if (keepPreviewOpen) {
        setExportPreviewState((prev) => (prev ? { ...prev, isUpdating: false } : prev));
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

  useEffect(() => {
    if (!exportPreview) return;
    if (exportRangeKeyRef.current === exportRangeKey) return;
    exportRangeKeyRef.current = exportRangeKey;
    handleExportImage({ keepPreviewOpen: true });
  }, [exportPreview, exportRangeKey, handleExportImage]);

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
  const exportRangeEndOptions = exportPeriodOptions.filter(
    (option) => option.period >= resolvedExportRange.start
  );
  const previewIsUpdating = Boolean(exportPreview?.isUpdating);
  const exportPreviewPanel = exportPreview ? (
    <div
      className="playExportPreview"
      role="dialog"
      aria-label="Play-by-play image preview"
      ref={exportPreviewRef}
    >
      <div className="playExportPreviewHeader">
        <span>Image builder</span>
        <button
          type="button"
          className="playExportPreviewClose"
          onClick={() => setExportPreviewState(null)}
          aria-label="Close image preview"
        >
          Close
        </button>
      </div>
      {exportPeriodOptions.length > 0 && (
        <div className="playExportPreviewOptions">
          <label className="playExportOption">
            <span>Start</span>
            <select
              value={resolvedExportRange.start}
              onChange={handleExportRangeStartChange}
              disabled={isExporting || previewIsUpdating}
            >
              {exportPeriodOptions.map(({ period, label }) => (
                <option key={period} value={period}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="playExportOption">
            <span>End</span>
            <select
              value={resolvedExportRange.end}
              onChange={handleExportRangeEndChange}
              disabled={isExporting || previewIsUpdating}
            >
              {exportRangeEndOptions.map(({ period, label }) => (
                <option key={period} value={period}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
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
