import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQueryParams } from '../schedule/useQueryParams';
import { useLocalStorageState } from '../state/useLocalStorageState';
import { useGameData } from './useGameData';
import { useGameTimeline } from './useGameTimeline';
import { useElementWidth } from '../ui/useElementWidth';
import { useLineupStats } from './useLineupStats';
import { useScheduleState } from '../schedule/useScheduleState';
import { useSelectedGameState } from '../schedule/useSelectedGameState';
import { useGamePackSync } from './useGamePackSync';
import { useLiveUpdates } from '../realtime/useLiveUpdates';
import { useResumeRefresh } from '../realtime/useResumeRefresh';
import { useAnalyticsSignals } from '../analytics/useAnalyticsSignals';

const DEFAULT_STAT_ON = [true, false, true, true, false, false, false, false];
const LOADING_DELAY_MS = 500;

/**
 * Facade hook that orchestrates all game data, WebSocket, and UI state.
 * Uses Server-Side Init to determine the landing state.
 */
export function useMinutesMap() {
  const { getInitialParams, updateQueryParams } = useQueryParams();
  const initialParams = useMemo(() => getInitialParams(), [getInitialParams]);

  // === USER PREFERENCES ===
  const [statOn, setStatOn] = useLocalStorageState('statOn', DEFAULT_STAT_ON);
  const [showScoreDiff, setShowScoreDiff] = useLocalStorageState('showScoreDiff', true);

  // === GAME DATA ===
  const {
    schedule,
    fetchSchedule,
    isScheduleLoading,
    box,
    playByPlay,
    nbaGameId,
    numPeriods,
    lastAction,
    gameStatusMessage,
    isBoxLoading,
    isPlayLoading,
    fetchGamePack,
    setGameNotStarted,
    resetLoadingStates,
  } = useGameData();

  const {
    gameId,
    setGameId,
    changeGame,
    selectedScheduleGame,
    stableGameMeta,
    currentScheduleGameStatus,
    isSelectedGameUpcoming,
    isSelectedGameFinal,
  } = useSelectedGameState({
    initialGameId: initialParams.gameId,
    schedule,
    resetLoadingStates,
  });

  const scheduleFetchRef = useRef(() => {});
  const fetchScheduleForDateChange = useCallback((dateString, reason = 'date-change') => {
    scheduleFetchRef.current?.(dateString, reason);
  }, []);

  const { date, isInitLoading, changeDate, sortedGames } = useScheduleState({
    initialDate: initialParams.date,
    initialGameId: initialParams.gameId,
    gameId,
    setGameId,
    schedule,
    isScheduleLoading,
    fetchScheduleWithReason: fetchScheduleForDateChange,
  });

  const {
    fetchGamePackWithReason,
    fetchScheduleWithReason,
    lastGamePackFetchRef,
    lastScheduleFetchRef,
  } = useGamePackSync({
    date,
    gameId,
    selectedScheduleGame,
    isSelectedGameUpcoming,
    isScheduleLoading,
    fetchGamePack,
    fetchSchedule,
    setGameNotStarted,
  });

  scheduleFetchRef.current = fetchScheduleWithReason;

  const { ws } = useLiveUpdates({
    gameId,
    date,
    schedule,
    fetchGamePackWithReason,
    fetchScheduleWithReason,
  });

  // === URL SYNC ===
  useEffect(() => {
    if (date) {
      updateQueryParams(date, gameId);
    }
  }, [date, gameId, updateQueryParams]);

  // === PROCESSED TIMELINES ===
  const {
    scoreTimeline,
    homePlayerTimeline,
    awayPlayerTimeline,
    allActions,
    awayActions,
    homeActions,
    awayActionsAll,
    homeActionsAll,
  } = useGameTimeline(playByPlay, statOn);

  const lineupStats = useLineupStats({
    awayPlayerTimeline,
    homePlayerTimeline,
    scoreTimeline,
    numPeriods,
  });

  // === LAYOUT ===
  const [playByPlaySectionRef, playByPlaySectionWidth] = useElementWidth();

  // === LOADING DELAY (avoid flash) ===
  const [showLoading, setShowLoading] = useState(false);
  const isGlobalLoading = isInitLoading || isScheduleLoading;

  useEffect(() => {
    if (isGlobalLoading) {
      const timer = setTimeout(() => setShowLoading(true), LOADING_DELAY_MS);
      return () => clearTimeout(timer);
    }
    setShowLoading(false);
  }, [isGlobalLoading]);

  const isWebSocketOpen = typeof WebSocket !== 'undefined' && ws?.readyState === WebSocket.OPEN;

  useResumeRefresh({
    date,
    gameId,
    isSelectedGameFinal,
    isWebSocketOpen,
    fetchGamePackWithReason,
    fetchScheduleWithReason,
    lastGamePackFetchRef,
    lastScheduleFetchRef,
  });

  useAnalyticsSignals({
    gameId,
    date,
    currentScheduleGameStatus,
    isInitLoading,
  });

  // === PUBLIC EVENT HANDLERS ===
  const changeStatOn = useCallback(
    (index) => {
      setStatOn((prev) => {
        const updated = [...prev];
        updated[index] = !updated[index];
        return updated;
      });
    },
    [setStatOn],
  );

  const awayTeam = box?.teams?.away;
  const homeTeam = box?.teams?.home;

  const awayTeamName = useMemo(
    () => ({
      name: awayTeam?.name || 'Away Team',
      abr: awayTeam?.abbr || '',
    }),
    [awayTeam?.name, awayTeam?.abbr],
  );

  const homeTeamName = useMemo(
    () => ({
      name: homeTeam?.name || 'Home Team',
      abr: homeTeam?.abbr || '',
    }),
    [homeTeam?.name, homeTeam?.abbr],
  );

  const scoreAwayTeam = awayTeam?.abbr || stableGameMeta?.awayteam || null;
  const scoreHomeTeam = homeTeam?.abbr || stableGameMeta?.hometeam || null;
  const scoreGameDate = box?.start || stableGameMeta?.starttime || null;

  const isScheduleVisible = isGlobalLoading && showLoading;
  const isGameDataVisible = isBoxLoading || isPlayLoading;
  const isPlayVisible = isPlayLoading;
  const isBoxVisible = isBoxLoading;

  const scheduleVm = {
    games: sortedGames,
    date: date || '',
    gameId,
    changeDate,
    changeGame,
    isLoading: isScheduleVisible,
  };

  const scoreVm = {
    homeTeam: scoreHomeTeam,
    awayTeam: scoreAwayTeam,
    currentScore: scoreTimeline[scoreTimeline.length - 1],
    gameDate: scoreGameDate,
    gameStatusMessage,
    isLoading: isGameDataVisible,
    lastAction,
    gameStatus: currentScheduleGameStatus,
  };

  const playVm = {
    gameId,
    nbaGameId,
    gameStatus: currentScheduleGameStatus,
    gameDate: scoreGameDate,
    box,
    awayTeamName,
    homeTeamName,
    awayActions,
    awayActionsAll,
    homeActions,
    homeActionsAll,
    allActions,
    scoreTimeline,
    awayPlayerTimeline,
    homePlayerTimeline,
    numPeriods,
    numQs: numPeriods,
    lastAction,
    playByPlaySectionRef,
    playByPlaySectionWidth,
    isLoading: isPlayVisible,
    statusMessage: gameStatusMessage,
    showScoreDiff,
    statOn,
  };

  const statControlsVm = {
    statOn,
    changeStatOn,
    showScoreDiff,
    setShowScoreDiff,
    isLoading: isPlayVisible,
    statusMessage: gameStatusMessage,
  };

  const boxVm = {
    box,
    isLoading: isBoxVisible,
    statusMessage: gameStatusMessage,
  };

  const lineupsVm = {
    awayTeam: awayTeamName,
    homeTeam: homeTeamName,
    awayLineups: lineupStats?.away || [],
    homeLineups: lineupStats?.home || [],
    isLoading: isPlayVisible,
    statusMessage: gameStatusMessage,
  };

  // === PUBLIC API ===
  // Stage 2 app boundary: grouped VMs are the stable contract for consumers.
  return {
    scheduleVm,
    scoreVm,
    playVm,
    statControlsVm,
    boxVm,
    lineupsVm,
  };
}
