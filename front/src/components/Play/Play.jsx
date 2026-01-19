import { useEffect, useRef, useMemo, useState } from 'react';
import html2canvas from 'html2canvas';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme } from '../hooks/useTheme'; // Adjust path
import { getMatchupColors, getSafeBackground } from '../../helpers/teamColors'; // Adjust path
import { useMinimumLoadingState } from '../hooks/useMinimumLoadingState';
import { getGameTotalSeconds, getPeriodDurationSeconds, getPeriodStartSeconds, getSecondsElapsed } from '../../helpers/playTimeline';
import { buildNbaEventUrl, resolveVideoAction } from '../../helpers/nbaEvents';

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
    const exportTarget = playRef.current.closest('.playByPlaySection') || playRef.current;
    const shouldForceDesktopLayout = Boolean(
      exportTarget &&
      activePeriod === 0 &&
      sectionWidth > 0 &&
      sectionWidth < DESKTOP_EXPORT_WIDTH
    );
    let restoreBodyOverflow = null;
    try {
      setInfoLocked(false);
      setIsHoveringIcon(false);
      resetInteraction(true);

      if (shouldForceDesktopLayout) {
        exportTarget.classList.add('isDesktopExport');
        restoreBodyOverflow = document.body.style.overflowX;
        document.body.style.overflowX = 'hidden';
        for (let i = 0; i < 4; i += 1) {
          await waitForNextFrame();
        }
      } else {
        await waitForNextFrame();
      }

      const backgroundColor = resolveExportBackground(exportTarget);
      const scale = Math.max(2, Math.min(3, window.devicePixelRatio || 1));

      const canvas = await html2canvas(exportTarget, {
        backgroundColor,
        scale,
        logging: false,
        useCORS: true,
        onclone: (doc) => {
          const clonedExportButton = doc.querySelector('.playExportButton');
          if (clonedExportButton) {
            clonedExportButton.style.display = 'none';
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
      });

      const outputCanvas = buildPaddedCanvas(canvas, EXPORT_PADDING_PX, backgroundColor, scale);
      const blob = await new Promise((resolve) => {
        outputCanvas.toBlob(resolve, 'image/png');
      });

      if (!blob) {
        console.error('Play export failed: image blob was empty.');
        return;
      }

      const fileName = buildExportFileName();
      const file = new File([blob], fileName, { type: 'image/png' });
      let shared = false;

      if (typeof navigator !== 'undefined' && navigator.share) {
        const canShare = !navigator.canShare || navigator.canShare({ files: [file] });
        if (canShare) {
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
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (err) {
      console.error('Play export failed.', err);
    } finally {
      if (shouldForceDesktopLayout && exportTarget) {
        exportTarget.classList.remove('isDesktopExport');
        if (restoreBodyOverflow !== null) {
          document.body.style.overflowX = restoreBodyOverflow;
        }
      }
      setIsExporting(false);
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
      aria-label={isExporting ? 'Preparing image export' : 'Share image'}
      title={isExporting ? 'Preparing image...' : 'Share image'}
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
