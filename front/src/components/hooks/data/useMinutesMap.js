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
import { useTrackFeatureUseOnce } from '../analytics/useTrackFeatureUseOnce';
import { useTeamSchedule } from '../schedule/useTeamSchedule';
import {
  buildTeamGames,
  deriveSeasonLabel,
  findNearestGameIndex,
  gameIdIncludesTeam,
  normalizeTeamAbbr,
  summarizeTeamRecord,
} from '../../../domain/game-selection/teamSchedule';

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

  // === TEAM MODE ===
  // The strip shows one team's season; the date schedule keeps following the
  // selected game underneath so live updates and gamepack sync are unchanged.
  const [team, setTeam] = useState(initialParams.team || null);
  const pendingTeamSelectionRef = useRef(Boolean(initialParams.team));
  const trackTeamFeatureUse = useTrackFeatureUseOnce('team-schedule');

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
    skipAutoSelect: Boolean(team),
  });

  const teamSeason = team ? deriveSeasonLabel(date) : null;
  const teamSchedule = useTeamSchedule({ team, season: teamSeason });

  // Remember the latest schedule entry seen for each of the team's games, so moving to a
  // game on another date keeps today's live score and clock instead of falling back to the
  // season file, which only gets a game's score once it ends.
  const [seenTeamScheduleGames, setSeenTeamScheduleGames] = useState({});
  useEffect(() => {
    if (!team || !Array.isArray(schedule)) return;
    setSeenTeamScheduleGames((prev) => {
      let next = prev;
      for (const entry of schedule) {
        if (
          entry?.id &&
          gameIdIncludesTeam(entry.id, team) &&
          JSON.stringify(prev[entry.id]) !== JSON.stringify(entry)
        ) {
          if (next === prev) next = { ...prev };
          next[entry.id] = entry;
        }
      }
      return next;
    });
  }, [schedule, team]);

  const teamGames = useMemo(
    () =>
      team
        ? buildTeamGames({
            payload: teamSchedule.payload,
            team,
            // The loaded date's schedule goes last so it wins over remembered entries.
            schedule: [...Object.values(seenTeamScheduleGames), ...(schedule || [])],
          })
        : [],
    [team, teamSchedule.payload, schedule, seenTeamScheduleGames],
  );
  const teamRecord = useMemo(() => summarizeTeamRecord(teamGames), [teamGames]);

  // `source` says how team mode was entered (e.g. 'team-picker' or 'scoreboard').
  const selectTeam = useCallback(
    (value, { source } = {}) => {
      const nextTeam = normalizeTeamAbbr(value);
      if (nextTeam === team) return;
      pendingTeamSelectionRef.current = Boolean(nextTeam);
      if (nextTeam) {
        trackTeamFeatureUse(source ? { source } : undefined);
      }
      setTeam(nextTeam);
    },
    [team, trackTeamFeatureUse],
  );

  const changeTeamGame = useCallback(
    (id) => {
      const game = teamGames.find((entry) => entry.id === id);
      if (!game) return;
      if (game.date !== date) {
        changeDate(game.date);
      }
      changeGameWithHistory(game.id);
    },
    [changeDate, changeGameWithHistory, date, teamGames],
  );

  // The scoreboard date button means "show me that day", which leaves team mode.
  const showDate = useCallback(
    (nextDate) => {
      selectTeam(null);
      changeDate(nextDate);
    },
    [changeDate, selectTeam],
  );

  // Entering team mode keeps the current game when it involves the team,
  // otherwise jumps to the team's game nearest the date being viewed.
  useEffect(() => {
    if (!team || !date || !pendingTeamSelectionRef.current) return;
    if (gameId && gameIdIncludesTeam(gameId, team)) {
      pendingTeamSelectionRef.current = false;
      return;
    }
    if (teamSchedule.status === 'loading' || teamSchedule.status === 'idle') return;
    if (!teamGames.length) {
      if (teamSchedule.status !== 'error') {
        pendingTeamSelectionRef.current = false;
      }
      return;
    }
    pendingTeamSelectionRef.current = false;
    const target = teamGames[findNearestGameIndex(teamGames, date)];
    if (target.date !== date) {
      changeDate(target.date);
    }
    changeGame(target.id);
  }, [changeDate, changeGame, date, gameId, team, teamGames, teamSchedule.status]);

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
      updateQueryParams(date, gameId, { mode: nextUrlHistoryModeRef.current, team });
      nextUrlHistoryModeRef.current = 'replace';
    }
  }, [date, gameId, team, updateQueryParams]);

  useEffect(() => {
    const handlePopState = () => {
      const nextParams = getInitialParams();
      nextUrlHistoryModeRef.current = 'replace';

      const nextTeam = nextParams.team ?? null;
      if (nextTeam !== team) {
        pendingTeamSelectionRef.current = false;
        setTeam(nextTeam);
      }

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
  }, [changeDate, changeGame, date, gameId, getInitialParams, resetLoadingStates, setGameId, team]);

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
    selectTeam,
    showDate,
    teamMode: team
      ? {
          team,
          season: teamSeason,
          games: teamGames,
          status: teamSchedule.status,
          error: teamSchedule.error,
          retry: teamSchedule.retry,
          record: teamRecord,
          changeGame: changeTeamGame,
        }
      : null,
  };

  let dataNotice = null;
  // A previous or just-set error can coexist with the loading transition for
  // one render. Only announce it once the selected-game request has settled.
  if (gameDataError && !isGameDataVisible) {
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
