import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { resolveFullNameFromRoster } from './PlayExport/playExportModel';
import MobilePlayerSheet from './MobilePlayerSheet';
import PeriodButtons from './PeriodButtons';
import { useShareButtonSlot } from './PlayExport/ShareButtonSlot';
import CircularProgress from '@mui/material/CircularProgress';
import OddsGraph from './OddsGraph';
import PlayExportControls from './PlayExport/PlayExportControls';
import { usePlayPointerHandlers } from './hooks/usePlayPointerHandlers';
import { usePlayTips } from './hooks/usePlayTips';
import { usePlayViewModel } from './hooks/usePlayViewModel';
import Player from './Player/Player';
import ScoreGraph from './ScoreGraph';
import PlayTooltip from './PlayTooltip';
import PlayTips from './PlayTips';
import TimelineGrid from './TimelineGrid';
import { PLAY_LEFT_MARGIN, isCompactPlayWidth } from './model/layoutModel';
import { parseSharedView, removeSharedViewParams } from './model/sharedViewModel';
import { findActionMetaFromTarget } from './model/interactionModel';
import { usePlayInteraction } from './usePlayInteraction';
import { useMediaQuery } from '../hooks/ui/useMediaQuery';
import { useTrackFeatureUseOnce } from '../hooks/analytics/useTrackFeatureUseOnce';
import { trackFeatureUse } from '../../helpers/analytics';
import { shortPlayerNames } from '../../helpers/playerNames';
import './Play.scss';

const PLAYER_DETAIL_HISTORY_KEY = 'minutesMapPlayerDetail';
const POINTER_FOCUS_WINDOW_MS = 1500;
// Actions a player's row doesn't draw a marker for (see Player.jsx).
const UNMARKED_ACTION_TYPES = new Set(['substitution', 'jump ball', 'jumpball', 'violation']);

export default function Play({
  gameId,
  nbaGameId,
  gameStatus,
  box,
  playData,
  sectionWidth,
  isLoading,
  statusMessage,
  showScoreDiff = true,
  showOdds = false,
  statOn,
  changeStatOn,
  emphasizedStatIndex = null,
  onPlayerDetailModeChange,
}) {
  const {
    playRef,
    hasShortNames,
    markerScale,
    leftMargin,
    rightMargin,
    width,
    numPeriods,
    isFinal,
    activePeriod,
    isQuarterFocus,
    activePeriodLabel,
    latestStartedPeriod,
    selectPeriod,
    showQuarterSwitcher,
    periodOptions,
    showLoadingIndicator,
    showLoadingOverlay,
    displayStatusMessage,
    showStatusMessage,
    isDataLoading,
    hasDisplayData,
    displayAwayTeamNames,
    displayHomeTeamNames,
    displayAwayPlayers,
    displayAwayPlayersAll,
    displayAwayPlayerTimeline,
    displayHomePlayers,
    displayHomePlayersAll,
    displayHomePlayerTimeline,
    displayScoreTimeline,
    displayNumQs,
    filteredAllActions,
    filteredScoreTimeline,
    filteredOddsTimeline,
    filteredAwayPlayers,
    filteredHomePlayers,
    filteredAwayPlayerTimeline,
    filteredHomePlayerTimeline,
    filteredLastAction,
    timelineWindow,
    startScoreDiff,
    startOddsProb,
    teamColors,
    awayColor,
    homeColor,
    maxY,
    stablePlayData,
    periodData,
  } = usePlayViewModel({
    gameId,
    gameStatus,
    playData,
    sectionWidth,
    isLoading,
    statusMessage,
  });
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerDetailPeriod, setPlayerDetailPeriod] = useState(0);
  // A player highlighted on the full chart: their row stays bright and the rest fade.
  const [focusedPlayer, setFocusedPlayer] = useState(null);
  // The highlighted player's markers on the chart, which hovering and Previous/Next follow.
  const focusActions = useMemo(() => {
    if (!focusedPlayer) return null;
    const players = focusedPlayer.teamKey === 'away' ? filteredAwayPlayers : filteredHomePlayers;
    const actions = players?.[focusedPlayer.name];
    if (!actions) return null;
    const marked = actions.filter(
      (action) => !UNMARKED_ACTION_TYPES.has((action?.actionType || '').toString().toLowerCase()),
    );
    // None in this view: hovering and Previous/Next go back to every play.
    return marked.length ? marked : null;
  }, [focusedPlayer, filteredAwayPlayers, filteredHomePlayers]);
  // With a player highlighted, the tooltip already holds still on their row, so nothing
  // pins: a click on the chart clears the highlight, and the arrow keys step through
  // their plays.
  const isHighlightMode = Boolean(focusActions);
  const [shareButtonSlot] = useShareButtonSlot();
  // A player's detail view hides the legend (and the share slot in it), so it has its own.
  const [detailShareSlot, setDetailShareSlot] = useState(null);
  const chartInstructionsId = useId();
  const chartAnnouncementId = useId();

  const clearSelectedPlayer = useCallback(() => {
    setSelectedPlayer(null);
    setPlayerDetailPeriod(0);
  }, []);

  const isCurrentPlayerHistoryEntry = useCallback(
    () => Boolean(window.history.state?.[PLAYER_DETAIL_HISTORY_KEY]),
    [],
  );

  const {
    descriptionArray,
    mouseLinePos,
    highlightActionIds,
    focusActionMeta,
    infoLocked,
    hasPrevAction,
    hasNextAction,
    navigateAction,
    selectBoundaryAction,
    setInfoLocked,
    mousePosition,
    setMousePosition,
    setMouseLinePos,
    setDescriptionArray,
    setHighlightActionIds,
    updateHoverAt,
    resetInteraction,
  } = usePlayInteraction({
    leftMargin,
    timelineWidth: width,
    timelineWindow,
    allActions: filteredAllActions,
    focusActions,
    oddsTimeline: stablePlayData.oddsTimeline,
    playRef,
  });

  const chartAnnouncement = useMemo(() => {
    if (!descriptionArray.length) return 'No chart event selected.';
    return descriptionArray
      .map((action) => action.description)
      .filter(Boolean)
      .join('. ');
  }, [descriptionArray]);

  // When a mouse or finger last pressed the chart. A press also focuses it, and that press's
  // own click (or touch) handles the tooltip, so focusing shouldn't lock one first. A tap
  // focuses only once the finger lifts, hence the allowance.
  const lastPointerDownRef = useRef(0);
  const isRefocusingRef = useRef(false);
  // Set when the chart loses focus because the window or tab did, so coming back neither
  // closes nor reopens anything.
  const lostFocusToWindowRef = useRef(false);
  useEffect(() => {
    // The browser refocuses the chart as the window comes back, before this runs; if it
    // went elsewhere instead, the next focus is a fresh one.
    const handleWindowFocus = () => {
      window.setTimeout(() => {
        lostFocusToWindowRef.current = false;
      }, 0);
    };
    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, []);
  // Focused by a click or tap: no focus ring, even once a key is pressed (browsers show it
  // then), since the chart already shows where you are.
  const [isPointerFocused, setIsPointerFocused] = useState(false);
  const handleChartPointerDown = useCallback(() => {
    lastPointerDownRef.current = Date.now();
  }, []);

  // Tabbing to the chart opens the first play, ready for the arrow keys.
  const handleChartFocus = useCallback(
    (event) => {
      if (event.target !== event.currentTarget) return;
      if (isRefocusingRef.current) return;
      if (lostFocusToWindowRef.current) {
        lostFocusToWindowRef.current = false;
        return;
      }
      const isPointerFocus = Date.now() - lastPointerDownRef.current < POINTER_FOCUS_WINDOW_MS;
      setIsPointerFocused(isPointerFocus);
      if (isPointerFocus) return;
      const rect = event.currentTarget.getBoundingClientRect();
      setMousePosition({
        x: rect.left + rect.width / 2,
        y: rect.top + Math.min(rect.height / 2, 280),
      });
      if (!descriptionArray.length) {
        selectBoundaryAction('first');
      }
      if (!isHighlightMode) setInfoLocked(true);
    },
    [
      descriptionArray.length,
      isHighlightMode,
      selectBoundaryAction,
      setInfoLocked,
      setMousePosition,
    ],
  );

  const handleChartBlur = useCallback(
    (event) => {
      if (event.currentTarget.contains(event.relatedTarget)) return;
      // Switching window or tab: keep a pinned tooltip as it is for coming back.
      if (!document.hasFocus()) {
        lostFocusToWindowRef.current = true;
        return;
      }
      lostFocusToWindowRef.current = false;
      setIsPointerFocused(false);
      setInfoLocked(false);
      resetInteraction(true);
    },
    [resetInteraction, setInfoLocked],
  );

  // One play along with the arrow keys. With nothing open yet, → starts at the first play
  // and ← at the last; at either end it stays put.
  const stepAction = useCallback(
    (direction) => {
      if (!descriptionArray.length) {
        selectBoundaryAction(direction > 0 ? 'first' : 'last');
        return;
      }
      if (!navigateAction(direction)) selectBoundaryAction(direction > 0 ? 'last' : 'first');
    },
    [descriptionArray.length, navigateAction, selectBoundaryAction],
  );

  const handleChartKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape' && event.currentTarget.contains(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        // Esc unpins a tooltip first, then clears a highlighted player.
        if (!infoLocked) setFocusedPlayer(null);
        setInfoLocked(false);
        resetInteraction(true);
        // Back to the chart from a button inside it, without opening a play as tabbing in does.
        isRefocusingRef.current = true;
        event.currentTarget.focus({ preventScroll: true });
        isRefocusingRef.current = false;
        return;
      }
      if (event.target !== event.currentTarget) return;

      let handled = true;
      if (event.key === 'ArrowLeft') {
        stepAction(-1);
      } else if (event.key === 'ArrowRight') {
        stepAction(1);
      } else if (event.key === 'Home') {
        selectBoundaryAction('first');
      } else if (event.key === 'End') {
        selectBoundaryAction('last');
      } else {
        handled = false;
      }

      if (handled) {
        event.preventDefault();
        event.stopPropagation();
        if (!isHighlightMode) setInfoLocked(true);
      }
    },
    [
      infoLocked,
      isHighlightMode,
      stepAction,
      resetInteraction,
      selectBoundaryAction,
      setInfoLocked,
    ],
  );

  useEffect(() => {
    setInfoLocked(false);
    setMouseLinePos(null);
    setDescriptionArray([]);
    setHighlightActionIds([]);
  }, [activePeriod, setInfoLocked, setMouseLinePos, setDescriptionArray, setHighlightActionIds]);

  useEffect(() => {
    clearSelectedPlayer();
    setFocusedPlayer(null);
  }, [clearSelectedPlayer, gameId]);

  const {
    isHoveringIcon,
    clearHoverIcon,
    handleMouseMove,
    handleMouseLeave,
    handleClick,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
  } = usePlayPointerHandlers({
    playRef,
    nbaGameId,
    displayAllActions: filteredAllActions,
    isDataLoading,
    infoLocked,
    descriptionArray,
    setInfoLocked,
    setMousePosition,
    updateHoverAt,
    resetInteraction,
  });

  const isMobilePlayerSheetEnabled = isCompactPlayWidth(sectionWidth);
  const isShowingMobilePlayerDetail = isMobilePlayerSheetEnabled && Boolean(selectedPlayer);
  const controlActivePeriod = isShowingMobilePlayerDetail ? playerDetailPeriod : activePeriod;

  useEffect(() => {
    onPlayerDetailModeChange?.(isShowingMobilePlayerDetail);
  }, [isShowingMobilePlayerDetail, onPlayerDetailModeChange]);

  useEffect(() => () => onPlayerDetailModeChange?.(false), [onPlayerDetailModeChange]);

  const isFinePointer = useMediaQuery('(hover: hover) and (pointer: fine)');
  const trackPlayInspect = useTrackFeatureUseOnce('play-inspect');
  const trackQuarterSelect = useTrackFeatureUseOnce('quarter-select');
  const trackPlayerDetail = useTrackFeatureUseOnce('player-detail');
  const trackPlayerFocus = useTrackFeatureUseOnce('player-focus');
  const hasOpenTooltip = descriptionArray.length > 0;

  // The first play someone opens (hover, drag, tap or keyboard), once per page load.
  useEffect(() => {
    if (hasOpenTooltip) trackPlayInspect({ input: isFinePointer ? 'pointer' : 'touch' });
  }, [hasOpenTooltip, isFinePointer, trackPlayInspect]);

  const awayPlayerCount = Object.keys(filteredAwayPlayers).length;
  const homePlayerCount = Object.keys(filteredHomePlayers).length;
  const playTips = usePlayTips({
    playRef,
    enabled:
      hasDisplayData &&
      !isDataLoading &&
      !showLoadingIndicator &&
      !showStatusMessage &&
      !isShowingMobilePlayerDetail &&
      awayPlayerCount + homePlayerCount > 0,
    canSelectPlayers: isMobilePlayerSheetEnabled,
    canHover: isFinePointer,
    hasOpenTooltip,
    isPlayerDetailOpen: isShowingMobilePlayerDetail,
    statsSignature: `${(statOn || []).map(Boolean).join(',')}|${showScoreDiff}|${showOdds}`,
  });

  useEffect(() => {
    if (!isMobilePlayerSheetEnabled && selectedPlayer) {
      clearSelectedPlayer();
    }
  }, [clearSelectedPlayer, isMobilePlayerSheetEnabled, selectedPlayer]);

  // Phones have no player highlight, so narrowing to one drops it.
  useEffect(() => {
    if (isMobilePlayerSheetEnabled) setFocusedPlayer(null);
  }, [isMobilePlayerSheetEnabled]);

  useEffect(() => {
    const handlePopState = (event) => {
      const historyPlayer = event.state?.[PLAYER_DETAIL_HISTORY_KEY] || null;
      if (historyPlayer?.gameId === gameId && isMobilePlayerSheetEnabled) {
        setSelectedPlayer({ teamKey: historyPlayer.teamKey, name: historyPlayer.name });
        setPlayerDetailPeriod(0);
        return;
      }

      if (selectedPlayer) {
        clearSelectedPlayer();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [clearSelectedPlayer, gameId, isMobilePlayerSheetEnabled, selectedPlayer]);

  const selectedPlayerDetail = useMemo(() => {
    if (!selectedPlayer) return null;

    const teamKey = selectedPlayer.teamKey === 'away' ? 'away' : 'home';
    const filteredPlayers = teamKey === 'away' ? displayAwayPlayers : displayHomePlayers;
    const allPlayers = teamKey === 'away' ? displayAwayPlayersAll : displayHomePlayersAll;
    const playerTimelines =
      teamKey === 'away' ? displayAwayPlayerTimeline : displayHomePlayerTimeline;
    const rosterPlayers = box?.teams?.[teamKey]?.players || [];

    if (!Object.prototype.hasOwnProperty.call(filteredPlayers, selectedPlayer.name)) {
      return null;
    }

    return {
      ...selectedPlayer,
      displayName:
        resolveFullNameFromRoster(selectedPlayer.name, rosterPlayers) || selectedPlayer.name,
      actions: filteredPlayers[selectedPlayer.name] || [],
      boxScoreActions: allPlayers[selectedPlayer.name] || [],
      timeline: playerTimelines[selectedPlayer.name] || [],
      teamColor: teamKey === 'away' ? teamColors.away : teamColors.home,
    };
  }, [
    selectedPlayer,
    displayAwayPlayers,
    displayAwayPlayersAll,
    displayAwayPlayerTimeline,
    displayHomePlayers,
    displayHomePlayersAll,
    displayHomePlayerTimeline,
    box,
    teamColors,
  ]);

  const focusedPlayerKey = focusedPlayer ? `${focusedPlayer.teamKey}:${focusedPlayer.name}` : '';

  const preferredExportContext = useMemo(() => {
    if (!selectedPlayerDetail || !isShowingMobilePlayerDetail) {
      // Sharing the chart with a player highlighted starts the image the same way.
      return focusedPlayerKey ? { exportView: 'full', exportFocusKey: focusedPlayerKey } : null;
    }

    const exportRange =
      Number(playerDetailPeriod) > 0
        ? { start: Number(playerDetailPeriod), end: Number(playerDetailPeriod) }
        : {
            start: 1,
            end: isFinal ? numPeriods : latestStartedPeriod || 1,
          };

    return {
      exportView: 'player-stacked',
      exportPlayerKey: `${selectedPlayerDetail.teamKey}:${selectedPlayerDetail.name}`,
      exportRange,
    };
  }, [
    selectedPlayerDetail,
    isShowingMobilePlayerDetail,
    playerDetailPeriod,
    isFinal,
    numPeriods,
    latestStartedPeriod,
    focusedPlayerKey,
  ]);

  useEffect(() => {
    if (selectedPlayer && !selectedPlayerDetail) {
      clearSelectedPlayer();
    }
  }, [clearSelectedPlayer, selectedPlayer, selectedPlayerDetail]);

  const openPlayerDetail = useCallback(
    (teamKey, name) => {
      setInfoLocked(false);
      clearHoverIcon();
      resetInteraction(true);
      setSelectedPlayer({ teamKey, name });
      setPlayerDetailPeriod(0);
      window.history.pushState(
        {
          ...(window.history.state || {}),
          [PLAYER_DETAIL_HISTORY_KEY]: { gameId, teamKey, name },
        },
        '',
        window.location.href,
      );
    },
    [clearHoverIcon, gameId, resetInteraction, setInfoLocked],
  );

  const handlePlayerSelect = (teamKey, name) => {
    if (!isMobilePlayerSheetEnabled) return;
    trackPlayerDetail();
    openPlayerDetail(teamKey, name);
  };

  const isFocusedPlayer = (teamKey, name) =>
    focusedPlayer?.teamKey === teamKey && focusedPlayer?.name === name;

  const toggleFocusedPlayer = (teamKey, name) => {
    // A pinned play may not be theirs, so start fresh.
    setInfoLocked(false);
    resetInteraction(true);
    if (isFocusedPlayer(teamKey, name)) {
      setFocusedPlayer(null);
      return;
    }
    trackPlayerFocus();
    setFocusedPlayer({ teamKey, name });
  };

  // Phones open the player's own view from their name; wider charts highlight them instead.
  const handlePlayerNameSelect = (teamKey, name) => {
    if (isMobilePlayerSheetEnabled) {
      handlePlayerSelect(teamKey, name);
      return;
    }
    toggleFocusedPlayer(teamKey, name);
  };

  // A shared link's view (see sharedViewModel), applied once to the first game shown.
  const [initialSharedView] = useState(() =>
    typeof window === 'undefined' ? null : parseSharedView(window.location.search),
  );
  const pendingSharedViewRef = useRef(initialSharedView);
  const sharedViewGameIdRef = useRef(null);

  useEffect(() => {
    const view = pendingSharedViewRef.current;
    if (!view || !gameId) return;
    if (!sharedViewGameIdRef.current) sharedViewGameIdRef.current = gameId;
    const isSharedGame = gameId === sharedViewGameIdRef.current;
    if (isSharedGame && (!hasDisplayData || isDataLoading || !(sectionWidth > 0))) return;

    pendingSharedViewRef.current = null;
    // Drop the parameters first, so they don't follow the reader to other games and the
    // player view below opens over a clean entry that its Back button returns to.
    window.history.replaceState(
      window.history.state,
      '',
      removeSharedViewParams(window.location.href),
    );
    if (!isSharedGame) return;

    const { period, playerName, focusName } = view;
    const canShowPeriod =
      period !== null &&
      period <= numPeriods &&
      (period === 0 || isFinal || period <= latestStartedPeriod);
    if (canShowPeriod && showQuarterSwitcher) selectPeriod(period);

    let playerTeamKey = null;
    let playerKey = null;
    if (playerName && isMobilePlayerSheetEnabled) {
      const wanted = playerName.toLowerCase();
      for (const [teamKey, players] of [
        ['away', displayAwayPlayers],
        ['home', displayHomePlayers],
      ]) {
        playerKey = Object.keys(players || {}).find((name) => name.toLowerCase() === wanted);
        if (playerKey) {
          playerTeamKey = teamKey;
          break;
        }
      }
    }
    if (playerTeamKey) {
      openPlayerDetail(playerTeamKey, playerKey);
      if (canShowPeriod) setPlayerDetailPeriod(period);
    }

    let focusTeamKey = null;
    // Highlighting is for wider charts; phones open players in their own view instead.
    if (focusName && !isMobilePlayerSheetEnabled) {
      const wanted = focusName.toLowerCase();
      for (const [teamKey, players] of [
        ['away', displayAwayPlayers],
        ['home', displayHomePlayers],
      ]) {
        const focusKey = Object.keys(players || {}).find((name) => name.toLowerCase() === wanted);
        if (focusKey) {
          focusTeamKey = teamKey;
          setFocusedPlayer({ teamKey, name: focusKey });
          break;
        }
      }
    }

    trackFeatureUse('shared-view', {
      period,
      hasPlayer: Boolean(playerName),
      hasFocus: Boolean(focusName),
      shownPeriod: canShowPeriod && showQuarterSwitcher,
      shownPlayer: Boolean(playerTeamKey),
      shownFocus: Boolean(focusTeamKey),
    });
  }, [
    gameId,
    hasDisplayData,
    isDataLoading,
    sectionWidth,
    numPeriods,
    isFinal,
    latestStartedPeriod,
    showQuarterSwitcher,
    selectPeriod,
    isMobilePlayerSheetEnabled,
    displayAwayPlayers,
    displayHomePlayers,
    openPlayerDetail,
  ]);

  // Narrower charts show short names. Phones also use team tricodes, so the first
  // period label has room beside the team name.
  const awayShortNames = useMemo(
    () => (hasShortNames ? shortPlayerNames(Object.keys(displayAwayPlayers || {})) : {}),
    [hasShortNames, displayAwayPlayers],
  );
  const homeShortNames = useMemo(
    () => (hasShortNames ? shortPlayerNames(Object.keys(displayHomePlayers || {})) : {}),
    [hasShortNames, displayHomePlayers],
  );
  // The open player's team, for the logo beside their name.
  const playerTeamNames =
    selectedPlayerDetail?.teamKey === 'away' ? displayAwayTeamNames : displayHomeTeamNames;
  const awayTeamLabel =
    isMobilePlayerSheetEnabled && displayAwayTeamNames.abr
      ? displayAwayTeamNames.abr
      : displayAwayTeamNames.name;
  const homeTeamLabel =
    isMobilePlayerSheetEnabled && displayHomeTeamNames.abr
      ? displayHomeTeamNames.abr
      : displayHomeTeamNames.name;

  const awayTeamNameRef = useRef(null);
  const [awayTeamNameRight, setAwayTeamNameRight] = useState(0);
  useLayoutEffect(() => {
    const node = awayTeamNameRef.current;
    if (!node) return;
    const right = node.offsetLeft + node.offsetWidth;
    if (right !== awayTeamNameRight) setAwayTeamNameRight(right);
  });
  const periodLabelMinX = hasShortNames && awayTeamNameRight ? awayTeamNameRight + 6 : 0;

  // A click outside the chart clears the highlight. Clicks on the chart inspect plays (which
  // follow the highlighted player), and sharing keeps it so the image can show it; a name
  // click changes it (and stops the click before it gets here).
  useEffect(() => {
    if (!focusedPlayer || isShowingMobilePlayerDetail) return undefined;
    const handleDocumentClick = (event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('.play, .playExportButton, .playExportPreview, .playExportError')
      ) {
        return;
      }
      setFocusedPlayer(null);
    };
    // Esc too, once no tooltip is pinned (the first Esc unpins it). The chart handles its
    // own keys while it has focus; elsewhere (say on the name just clicked) the arrow keys
    // still step through the highlighted player's plays.
    const handleDocumentKeyDown = (event) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        if (!infoLocked) setFocusedPlayer(null);
        return;
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (!isHighlightMode || event.target === playRef.current) return;
      const target = event.target;
      if (
        target instanceof Element &&
        (target.closest('input, select, textarea') || target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      stepAction(event.key === 'ArrowLeft' ? -1 : 1);
    };
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      document.removeEventListener('click', handleDocumentClick);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [focusedPlayer, isShowingMobilePlayerDetail, infoLocked, isHighlightMode, stepAction]);

  // Where a click that cleared the highlight was, so the tooltip can pick up from there.
  const pendingHoverRef = useRef(null);
  useEffect(() => {
    const pending = pendingHoverRef.current;
    if (!pending || focusedPlayer) return;
    pendingHoverRef.current = null;
    updateHoverAt(pending.x, pending.y, pending.target, true);
  }, [focusedPlayer, updateHoverAt]);

  const handleChartClick = (event) => {
    if (isHighlightMode) {
      // Their own marker still opens its video; any other click clears the highlight.
      const actionMeta = findActionMetaFromTarget(event.target, playRef.current);
      const isTheirMarker =
        actionMeta?.actionNumber &&
        focusActions.some((action) => String(action.actionNumber) === actionMeta.actionNumber);
      if (!isTheirMarker) {
        pendingHoverRef.current = { x: event.clientX, y: event.clientY, target: event.target };
        setInfoLocked(false);
        setFocusedPlayer(null);
        return;
      }
    }
    handleClick(event);
  };

  const focusedTeamPlayers =
    focusedPlayer?.teamKey === 'away' ? filteredAwayPlayers : filteredHomePlayers;
  // Only fade the others while the highlighted player has a row in this view.
  const hasFocusInChart =
    Boolean(focusedPlayer) &&
    Object.prototype.hasOwnProperty.call(focusedTeamPlayers || {}, focusedPlayer.name);
  // With a player highlighted, the tooltip sits where the cursor line crosses their row
  // instead of following the pointer, so it only moves when the play it shows changes.
  let tooltipPosition = mousePosition;
  if (hasFocusInChart && mouseLinePos !== null && playRef.current) {
    const chartRect = playRef.current.getBoundingClientRect();
    const rowRect = playRef.current.querySelector('.player.isFocused')?.getBoundingClientRect();
    if (rowRect) {
      tooltipPosition = {
        x: chartRect.left + mouseLinePos,
        y: rowRect.top + rowRect.height / 2,
      };
    }
  }

  const getRowFocus = (teamKey, name) => {
    if (!hasFocusInChart) return null;
    return isFocusedPlayer(teamKey, name) ? 'focused' : 'dimmed';
  };
  const getNameSelectProps = (teamKey, name) => {
    if (isMobilePlayerSheetEnabled) {
      return { selectLabel: `Open player detail for ${name}` };
    }
    const isFocused = isFocusedPlayer(teamKey, name);
    return {
      selectLabel: isFocused ? `Stop highlighting ${name}` : `Highlight ${name}`,
      selectPressed: isFocused,
    };
  };

  const handlePlayerDetailClose = () => {
    if (isCurrentPlayerHistoryEntry()) {
      clearSelectedPlayer();
      window.history.back();
      return;
    }
    clearSelectedPlayer();
  };

  const handlePeriodSelect = (period, label) => {
    // Tapping the period that's already open goes back to the whole game.
    const isClosing = period !== 0 && period === controlActivePeriod;
    const nextPeriod = isClosing ? 0 : period;
    trackQuarterSelect({ period: isClosing ? 'Game' : label });
    if (isShowingMobilePlayerDetail) {
      setPlayerDetailPeriod(nextPeriod);
      return;
    }
    selectPeriod(nextPeriod);
  };

  // The chart has its period buttons in its top band (PeriodButtons); a player's detail
  // view has no chart, so it keeps this switch above it.
  const showPeriodButtons = showQuarterSwitcher && !isShowingMobilePlayerDetail;
  // With the buttons in the top band, the grid lines start below it, and the score lead
  // and win odds stop short of it (and by as much at the bottom, so both teams keep the
  // same scale around the middle line).
  const gridLineTop = showPeriodButtons ? 25 : 6;
  const overlayEdgeY = showPeriodButtons ? 28 : undefined;
  const quarterSwitcher =
    showQuarterSwitcher && isShowingMobilePlayerDetail ? (
      <div className="playQuarterSwitcher">
        {periodOptions.map(({ period, label }) => (
          <button
            key={period}
            type="button"
            className={`quarterTab ${period === controlActivePeriod ? 'isActive' : ''}`}
            onClick={() => handlePeriodSelect(period, label)}
            disabled={isDataLoading || (period !== 0 && period > latestStartedPeriod)}
            aria-pressed={period === controlActivePeriod}
          >
            {label}
          </button>
        ))}
      </div>
    ) : null;

  if (showLoadingIndicator) {
    return (
      <div className="playWrapper">
        {quarterSwitcher}
        <div className="play">
          <div className="loadingIndicator" role="status">
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
          <div className="playContent">
            <div className="statusMessage" role="status">
              {displayStatusMessage}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="playWrapper">
      {quarterSwitcher}
      <PlayExportControls
        buttonContainer={isShowingMobilePlayerDetail ? detailShareSlot : shareButtonSlot}
        playRef={playRef}
        gameId={gameId}
        gameStatus={gameStatus}
        box={box}
        exportData={{
          stablePlayData,
          periodData,
          hasDisplayData,
          isDataLoading,
          isFinal,
          numPeriods,
          // Exported images keep the desktop name column.
          leftMargin: PLAY_LEFT_MARGIN,
          rightMargin,
          showScoreDiff,
          showOdds,
          statOn,
          teamColors,
          awayColor,
          homeColor,
          preferredExportContext,
        }}
        onExportInteractionStart={() => {
          setInfoLocked(false);
          clearHoverIcon();
          resetInteraction(true);
        }}
      />
      <p id={chartInstructionsId} className="playChartInstructions">
        Interactive play-by-play chart. Use Left and Right Arrow to inspect events, Home and End to
        jump to the first or last event, and Tab to reach available event actions.
      </p>
      <div
        ref={playRef}
        className={`play${isDataLoading ? ' isLoading' : ''}${isPointerFocused ? ' isPointerFocused' : ''}`}
        style={{ width: sectionWidth }}
        role="region"
        aria-label="Play-by-play chart"
        aria-describedby={`${chartInstructionsId} ${chartAnnouncementId}`}
        aria-busy={isDataLoading}
        tabIndex={isDataLoading ? -1 : 0}
        onPointerDown={handleChartPointerDown}
        onFocus={handleChartFocus}
        onBlur={handleChartBlur}
        onKeyDown={handleChartKeyDown}
        onMouseMove={isDataLoading ? undefined : handleMouseMove}
        onMouseLeave={isDataLoading ? undefined : handleMouseLeave}
        onClick={isDataLoading ? undefined : handleChartClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        <span
          id={chartAnnouncementId}
          className="playChartAnnouncement"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {chartAnnouncement}
        </span>
        {!isDataLoading && !isShowingMobilePlayerDetail && (
          <PlayTooltip
            descriptionArray={descriptionArray}
            focusActionMeta={focusActionMeta}
            mousePosition={tooltipPosition}
            hasPlayerHighlight={isHighlightMode}
            infoLocked={infoLocked}
            isHoveringIcon={isHoveringIcon}
            nbaGameId={nbaGameId}
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

        {playTips.activeTip && !isShowingMobilePlayerDetail && (
          <PlayTips
            activeTip={playTips.activeTip}
            playRef={playRef}
            layoutKey={`${sectionWidth}|${activePeriod}|${awayPlayerCount}|${homePlayerCount}`}
            isFinePointer={isFinePointer}
            onCalloutHover={handleMouseLeave}
            onDismiss={playTips.dismissTip}
            onSkip={playTips.skipTips}
          />
        )}

        {showLoadingOverlay && !isShowingMobilePlayerDetail && (
          <div className="loadingOverlay" role="status">
            <CircularProgress size={20} thickness={5} />
            <span>Loading play-by-play...</span>
          </div>
        )}

        <div className="playContent">
          {selectedPlayerDetail && isMobilePlayerSheetEnabled ? (
            <MobilePlayerSheet
              selectedPlayer={selectedPlayerDetail}
              playerDisplayName={selectedPlayerDetail.displayName}
              selectedPeriod={playerDetailPeriod}
              numPeriods={numPeriods}
              latestStartedPeriod={latestStartedPeriod}
              isFinal={isFinal}
              actions={selectedPlayerDetail.actions}
              boxScoreActions={selectedPlayerDetail.boxScoreActions}
              timeline={selectedPlayerDetail.timeline}
              scoreTimeline={displayScoreTimeline}
              statOn={statOn}
              onToggleStat={changeStatOn}
              teamColor={selectedPlayerDetail.teamColor}
              team={playerTeamNames?.abr}
              teamName={playerTeamNames?.name}
              showBackHint={playTips.showBackHint}
              onClose={handlePlayerDetailClose}
            />
          ) : (
            <>
              <svg height="600" width={sectionWidth} className="line playGrid" aria-hidden="true">
                <TimelineGrid
                  width={width}
                  leftMargin={leftMargin}
                  timelineWindow={timelineWindow}
                  numQs={displayNumQs}
                  awayTeamName={displayAwayTeamNames.name}
                  homeTeamName={displayHomeTeamNames.name}
                  isQuarterView={isQuarterFocus}
                  activePeriodLabel={activePeriodLabel}
                  labelMinX={periodLabelMinX}
                  showPeriodLabels={!showPeriodButtons}
                  lineTop={gridLineTop}
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
                  awayLineColor={teamColors.away}
                  homeLineColor={teamColors.home}
                  startScoreDiff={startScoreDiff}
                  edgeY={overlayEdgeY}
                />

                <OddsGraph
                  oddsTimeline={filteredOddsTimeline}
                  lastAction={filteredLastAction}
                  width={width}
                  leftMargin={leftMargin}
                  timelineWindow={timelineWindow}
                  showOdds={showOdds}
                  startOddsProb={startOddsProb}
                  edgeY={overlayEdgeY}
                />

                {mouseLinePos !== null && (
                  <line
                    x1={mouseLinePos}
                    y1={gridLineTop}
                    x2={mouseLinePos}
                    y2={594}
                    className="playCursorLine"
                  />
                )}
              </svg>

              {showPeriodButtons && (
                <PeriodButtons
                  activePeriod={activePeriod}
                  periodOptions={periodOptions}
                  timelineWindow={timelineWindow}
                  leftMargin={leftMargin}
                  width={width}
                  minX={awayTeamNameRight ? awayTeamNameRight + 6 : 0}
                  latestStartedPeriod={latestStartedPeriod}
                  disabled={isDataLoading}
                  onSelect={handlePeriodSelect}
                />
              )}

              <div className="teamName away" ref={awayTeamNameRef}>
                <span className="teamNameSwatch" style={{ background: teamColors.away }} />
                {awayTeamLabel}
              </div>
              <div className="teamSection">
                {Object.keys(filteredAwayPlayers).map((name) => (
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
                    emphasizedStatIndex={emphasizedStatIndex}
                    cursorX={mouseLinePos === null ? null : mouseLinePos - leftMargin}
                    compactName={hasShortNames}
                    markerScale={markerScale}
                    label={awayShortNames[name]}
                    focus={getRowFocus('away', name)}
                    focusColor={teamColors.away}
                    onSelect={() => handlePlayerNameSelect('away', name)}
                    {...getNameSelectProps('away', name)}
                  />
                ))}
              </div>

              <div className="teamName home">
                <span className="teamNameSwatch" style={{ background: teamColors.home }} />
                {homeTeamLabel}
              </div>
              <div className="teamSection">
                {Object.keys(filteredHomePlayers).map((name) => (
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
                    emphasizedStatIndex={emphasizedStatIndex}
                    cursorX={mouseLinePos === null ? null : mouseLinePos - leftMargin}
                    compactName={hasShortNames}
                    markerScale={markerScale}
                    label={homeShortNames[name]}
                    focus={getRowFocus('home', name)}
                    focusColor={teamColors.home}
                    onSelect={() => handlePlayerNameSelect('home', name)}
                    {...getNameSelectProps('home', name)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {isShowingMobilePlayerDetail && <div className="playShareRow" ref={setDetailShareSlot} />}
    </div>
  );
}
