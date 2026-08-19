import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQueryParams } from '../schedule/useQueryParams';
import { useLocalStorageState } from '../state/useLocalStorageState';
import { isBooleanArrayPreference, isBooleanPreference } from '../state/storage';
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

const DEFAULT_STAT_ON = [true, false, false, true, false, false, false, false];
const BOOLEAN_PREFERENCE_OPTIONS = { validate: isBooleanPreference };
const STAT_PREFERENCE_OPTIONS = {
  validate: isBooleanArrayPreference(DEFAULT_STAT_ON.length),
};
const LOADING_DELAY_MS = 500;

/**
 * Facade hook that orchestrates all game data, WebSocket, and UI state.
 * Uses Server-Side Init to determine the landing state.
 */
export function useMinutesMap() {
  const { getInitialParams, updateQueryParams } = useQueryParams();
  const initialParams = useMemo(() => getInitialParams(), [getInitialParams]);

  // === USER PREFERENCES ===
  const [statOn, setStatOn] = useLocalStorageState(
    'statOn',
    DEFAULT_STAT_ON,
    STAT_PREFERENCE_OPTIONS,
  );
  const [showScoreDiff, setShowScoreDiff] = useLocalStorageState(
    'showScoreDiff',
    true,
    BOOLEAN_PREFERENCE_OPTIONS,
  );
  const [showOdds, setShowOdds] = useLocalStorageState(
    'showOddsOverlay',
    false,
    BOOLEAN_PREFERENCE_OPTIONS,
  );

  // === GAME DATA ===
  const {
    schedule,
    fetchSchedule,
    isScheduleLoading,
    scheduleStatus,
    scheduleError,
    box,
    playByPlay,
    nbaGameId,
    numPeriods,
    lastAction,
    captions,
    gameStatusMessage,
    gameDataError,
    loadedGameId,
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
  const nextUrlHistoryModeRef = useRef('replace');

  const changeGameWithHistory = useCallback(
    (id) => {
      if (!id || id === gameId) return;
      nextUrlHistoryModeRef.current = 'push';
      changeGame(id);
    },
    [changeGame, gameId],
  );

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

  const retrySchedule = useCallback(() => {
    if (date) {
      fetchScheduleWithReason(date, 'retry');
    }
  }, [date, fetchScheduleWithReason]);

  const retryGameData = useCallback(() => {
    if (gameId) {
      fetchGamePackWithReason({ gameId, showLoading: true }, 'retry');
    }
  }, [fetchGamePackWithReason, gameId]);

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
      updateQueryParams(date, gameId, { mode: nextUrlHistoryModeRef.current });
      nextUrlHistoryModeRef.current = 'replace';
    }
  }, [date, gameId, updateQueryParams]);

  useEffect(() => {
    const handlePopState = () => {
      const nextParams = getInitialParams();
      nextUrlHistoryModeRef.current = 'replace';

      if (nextParams.date && nextParams.date !== date) {
        changeDate(nextParams.date);
      }

      if (nextParams.gameId) {
        if (nextParams.gameId !== gameId) {
          changeGame(nextParams.gameId);
        }
        return;
      }

      if (gameId) {
        resetLoadingStates();
        setGameId(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [changeDate, changeGame, date, gameId, getInitialParams, resetLoadingStates, setGameId]);

  // === PROCESSED TIMELINES ===
  const {
    scoreTimeline,
    oddsTimeline,
    homePlayerTimeline,
    awayPlayerTimeline,
    allActions,
    playerActions,
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
  const isGameDataStale = Boolean(
    gameId && loadedGameId && String(gameId) !== String(loadedGameId),
  );

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

  const scoreAwayTeam = awayTeam?.abbr || (!isGameDataStale && stableGameMeta?.awayteam) || null;
  const scoreHomeTeam = homeTeam?.abbr || (!isGameDataStale && stableGameMeta?.hometeam) || null;
  const scoreGameDate = box?.start || (!isGameDataStale && stableGameMeta?.starttime) || null;
  const displayedGameStatus = isGameDataStale ? null : currentScheduleGameStatus;
  const displayedGameId = isGameDataStale ? loadedGameId : gameId;

  const isScheduleVisible = isGlobalLoading && showLoading;
  const isGameDataVisible = isBoxLoading || isPlayLoading;
  const isPlayVisible = isPlayLoading;
  const isBoxVisible = isBoxLoading;

  const scheduleVm = {
    games: sortedGames,
    date: date || '',
    gameId,
    changeDate,
    changeGame: changeGameWithHistory,
    isLoading: isScheduleVisible,
    isPending: isGlobalLoading,
    status: scheduleStatus,
    error: scheduleError,
    retry: retrySchedule,
  };

  let dataNotice = null;
  if (gameDataError) {
    dataNotice = {
      tone: 'error',
      message: isGameDataStale
        ? 'Couldn’t load the selected game. Showing data from the previous game.'
        : loadedGameId
          ? 'Game data couldn’t be refreshed. Showing the latest available data.'
          : 'Couldn’t load game data.',
      detail: gameDataError.message,
      retry: retryGameData,
    };
  } else if (isGameDataStale) {
    dataNotice = {
      tone: 'status',
      message: 'Loading the selected game. Showing data from the previous game.',
      detail: null,
      retry: null,
    };
  }

  const scoreVm = {
    homeTeam: scoreHomeTeam,
    awayTeam: scoreAwayTeam,
    currentScore: scoreTimeline[scoreTimeline.length - 1],
    gameDate: scoreGameDate,
    gameStatusMessage,
    isLoading: isGameDataVisible,
    lastAction,
    gameStatus: displayedGameStatus,
    dataNotice,
  };

  const playVm = {
    gameId: displayedGameId,
    nbaGameId,
    gameStatus: displayedGameStatus,
    box,
    playData: {
      awayTeamNames: awayTeamName,
      homeTeamNames: homeTeamName,
      playerActions,
      allActions,
      scoreTimeline,
      oddsTimeline,
      awayPlayerTimeline,
      homePlayerTimeline,
      numQs: numPeriods,
      lastAction,
      gameDate: scoreGameDate,
      captions,
    },
    playByPlaySectionRef,
    playByPlaySectionWidth,
    isLoading: isPlayVisible,
    statusMessage: gameStatusMessage,
    showScoreDiff,
    showOdds,
    statOn,
  };

  const statControlsVm = {
    statOn,
    changeStatOn,
    showScoreDiff,
    setShowScoreDiff,
    showOdds,
    setShowOdds,
    isLoading: isPlayVisible,
    statusMessage: gameStatusMessage,
  };

  const boxVm = {
    gameId: displayedGameId,
    box,
    isLoading: isBoxVisible,
    statusMessage: gameStatusMessage,
  };

  const lineupsVm = {
    gameId: displayedGameId,
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
