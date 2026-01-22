import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  parseGameStatus,
  parseGameSlug,
  scheduleMatchesDate,
  sortGamesForSelection,
} from '../../helpers/gameSelectionUtils';
import { PREFIX } from '../../environment';

import { useQueryParams } from './useQueryParams';
import { useLocalStorageState } from './useLocalStorageState';
import { useGameData } from './useGameData';
import { useSelectedGameMeta } from './useSelectedGameMeta';
import { useWebSocket } from './useWebSocket';
import { useWebSocketGate } from './useWebSocketGate';
import { useGameTimeline } from './useGameTimeline';
import { useElementWidth } from './useElementWidth';

const DEFAULT_STAT_ON = [true, false, true, true, false, false, false, false];
const LOADING_DELAY_MS = 500;

/**
 * Facade hook that orchestrates all game data, WebSocket, and UI state.
 * Uses Server-Side Init to determine the landing state.
 */
export function useCourtVision() {
  // === INITIALIZATION ===
  const { getInitialParams, updateQueryParams } = useQueryParams();
  const initialParams = useMemo(() => getInitialParams(), []);
  
  // Note: We removed getTodayString() because we now trust init.json

  // === CORE STATE ===
  // Start null if no URL params; wait for init.json to tell us the date
  const [date, setDate] = useState(initialParams.date || null);
  const [gameId, setGameId] = useState(initialParams.gameId || null);

  // Loading state for the boot sequence
  const [isInitLoading, setIsInitLoading] = useState(!initialParams.date);
  const [showLoading, setShowLoading] = useState(false);

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
    awayTeamId,
    homeTeamId,
    nbaGameId,
    numQs,
    lastAction,
    gameStatusMessage,
    isBoxLoading,
    isPlayLoading,
    fetchGamePack,
    setGameNotStarted,
    resetLoadingStates,
  } = useGameData();

  // === PROCESSED TIMELINES ===
  const {
    scoreTimeline,
    homePlayerTimeline,
    awayPlayerTimeline,
    allActions,
    awayActions,
    homeActions,
  } = useGameTimeline(playByPlay, homeTeamId, awayTeamId, lastAction, statOn);

  // === LAYOUT ===
  const [playByPlaySectionRef, playByPlaySectionWidth] = useElementWidth();

  // === REFS FOR CALLBACKS ===
  const fetchStateRef = useRef({ gameId: null, status: null });

  // === 1. BOOT SEQUENCE: FETCH INIT STATE ===
  // If the user didn't provide a date in the URL, fetch init.json
  useEffect(() => {
    if (date) return;

    const fetchInitState = async () => {
      try {
        const res = await fetch(`${PREFIX}/data/init.json`);
        if (res.ok) {
          const data = await res.json();
          // The server tells us the correct "NBA Day"
          setDate(data.date);
          // The server also tells us the "Best Game" to show automatically
          if (data.autoSelectGameId && !initialParams.gameId) {
            const slugParams = parseGameSlug(data.autoSelectGameId);
            if (slugParams) {
              setGameId(slugParams.gameId);
            }
          }
        } else {
          // Fallback: Browser date (only if init.json is missing/broken)
          setDate(new Date().toISOString().split('T')[0]);
        }
      } catch (err) {
        console.error("Init fetch failed:", err);
        setDate(new Date().toISOString().split('T')[0]);
      } finally {
        setIsInitLoading(false);
      }
    };

    fetchInitState();
  }, [date, initialParams.gameId]);

  // === EFFECT: FETCH SCHEDULE ON DATE CHANGE ===
  useEffect(() => {
    if (date) {
      fetchSchedule(date);
    }
  }, [date, fetchSchedule]);

  // === WEBSOCKET HANDLERS ===
  const handleGameUpdate = useCallback((key, version) => {
    const url = `${PREFIX}/${encodeURIComponent(key)}?v=${version}`;
    fetchGamePack({ url, showLoading: false });
  }, [fetchGamePack]);

  const handleDateUpdate = useCallback((updatedDate) => {
    // If we receive a signal that the date we are viewing changed, refresh it
    if (updatedDate === date) {
      fetchSchedule(date);
    }
  }, [date, fetchSchedule]);

  const {
    selectedGameDate,
    selectedGameStart,
    selectedGameStatus,
    selectedGameMetaId,
  } = useSelectedGameMeta({
    gameId,
    date,
    schedule,
  });

  const { enabled: wsEnabled, followDate: wsFollowDate, followGame: wsFollowGame } = useWebSocketGate({
    date,
    schedule,
    gameId,
    selectedGameDate,
    selectedGameStart,
    selectedGameStatus,
    selectedGameMetaId,
  });

  // === WEBSOCKET CONNECTION ===
  useWebSocket({
    gameId,
    date,
    enabled: wsEnabled,
    followDate: wsFollowDate,
    followGame: wsFollowGame,
    onPlayByPlayUpdate: handleGameUpdate,
    onBoxUpdate: handleGameUpdate,
    onDateUpdate: handleDateUpdate,
  });

  // === URL SYNC ===
  useEffect(() => {
    if (date) {
      updateQueryParams(date, gameId);
    }
  }, [date, gameId, updateQueryParams]);

  const selectedScheduleGame = useMemo(() => {
    if (!gameId) {
      return null;
    }
    const scheduleMatch = (schedule || []).find(
      (game) => String(game?.id) === String(gameId)
    );
    if (scheduleMatch) {
      return scheduleMatch;
    }
    return null;
  }, [gameId, schedule]);

  const [cachedGameMeta, setCachedGameMeta] = useState(null);

  useEffect(() => {
    setCachedGameMeta(null);
  }, [gameId]);

  useEffect(() => {
    if (!gameId || !selectedScheduleGame) {
      return;
    }
    setCachedGameMeta({
      id: String(gameId),
      hometeam: selectedScheduleGame.hometeam ?? null,
      awayteam: selectedScheduleGame.awayteam ?? null,
      starttime: selectedScheduleGame.starttime ?? null,
      status: selectedScheduleGame.status ?? null,
    });
  }, [gameId, selectedScheduleGame]);

  const cachedMetaForGame = cachedGameMeta && String(cachedGameMeta.id) === String(gameId)
    ? cachedGameMeta
    : null;
  const stableGameMeta = selectedScheduleGame || cachedMetaForGame;

  const isSelectedGameUpcoming = useMemo(() => {
    const status = selectedScheduleGame?.status;
    if (!status || typeof status !== 'string') {
      return false;
    }
    const parsed = parseGameStatus(status);
    if (parsed.isUpcoming) {
      return true;
    }
    const normalized = status.trim().toLowerCase();
    return (
      normalized === 'scheduled' ||
      normalized.startsWith('scheduled') ||
      normalized.includes('tbd')
    );
  }, [selectedScheduleGame?.status]);

  const shouldWaitForSchedule = Boolean(gameId)
    && !selectedScheduleGame
    && isScheduleLoading;

  // === GAME DATA FETCHING ===
  useEffect(() => {
    if (!gameId) {
      fetchStateRef.current = { gameId: null, status: null };
      return;
    }
    if (shouldWaitForSchedule) {
      return;
    }
    const isSameGame = fetchStateRef.current.gameId === gameId;
    const lastStatus = fetchStateRef.current.status;
    if (selectedScheduleGame && isSelectedGameUpcoming) {
      if (!isSameGame || lastStatus !== 'upcoming') {
        setGameNotStarted();
        fetchStateRef.current = { gameId, status: 'upcoming' };
      }
      return;
    }
    if (isSameGame && lastStatus === 'fetched') {
      return;
    }
    fetchStateRef.current = { gameId, status: 'fetched' };
    fetchGamePack({ gameId, showLoading: !isSameGame });
  }, [
    gameId,
    fetchGamePack,
    isSelectedGameUpcoming,
    selectedScheduleGame,
    setGameNotStarted,
    shouldWaitForSchedule,
  ]);

  // === LOADING DELAY (avoid flash) ===
  const isGlobalLoading = isInitLoading || isScheduleLoading;

  useEffect(() => {
    if (isGlobalLoading) {
      const timer = setTimeout(() => setShowLoading(true), LOADING_DELAY_MS);
      return () => clearTimeout(timer);
    }
    setShowLoading(false);
  }, [isGlobalLoading]);

  // === PUBLIC EVENT HANDLERS ===
  const changeDate = useCallback((e) => {
    const newDate = e.target.value;
    if (newDate === date) return;
    
    setDate(newDate);
  }, [date]);

  const changeGame = useCallback((id) => {
    if (!id || id === gameId) return;
    resetLoadingStates();
    setGameId(id);
  }, [gameId, resetLoadingStates]);

  const changeStatOn = useCallback((index) => {
    setStatOn(prev => {
      const updated = [...prev];
      updated[index] = !updated[index];
      return updated;
    });
  }, [setStatOn]);

  // === COMPUTED VALUES ===
  const sortedGames = useMemo(() => sortGamesForSelection(schedule || []), [schedule]);

  useEffect(() => {
    if (!date || gameId || isScheduleLoading) {
      return;
    }
    if (!sortedGames.length || !scheduleMatchesDate(sortedGames, date)) {
      return;
    }
    const defaultGame = sortedGames[0];
    if (!defaultGame?.id) {
      return;
    }
    setGameId(String(defaultGame.id));
  }, [date, gameId, isScheduleLoading, sortedGames]);
  const currentScheduleGameStatus = stableGameMeta?.status || null;

  const awayTeam = box?.teams?.away;
  const homeTeam = box?.teams?.home;

  const awayTeamName = useMemo(() => ({
    name: awayTeam?.name || 'Away Team',
    abr: awayTeam?.abbr || '',
  }), [awayTeam?.name, awayTeam?.abbr]);

  const homeTeamName = useMemo(() => ({
    name: homeTeam?.name || 'Home Team',
    abr: homeTeam?.abbr || '',
  }), [homeTeam?.name, homeTeam?.abbr]);

  const scoreAwayTeam = awayTeam?.abbr || stableGameMeta?.awayteam || null;
  const scoreHomeTeam = homeTeam?.abbr || stableGameMeta?.hometeam || null;
  const scoreGameDate = box?.start || stableGameMeta?.starttime || null;

  const isScheduleVisible = isGlobalLoading && showLoading;
  const isGameDataVisible = isBoxLoading || isPlayLoading;
  const isPlayVisible = isPlayLoading;
  const isBoxVisible = isBoxLoading;

  // === PUBLIC API ===
  return {
    // Schedule
    games: sortedGames,
    date: date || "", // Guard against null during init
    gameId,
    changeDate,
    changeGame,
    isScheduleLoading: isScheduleVisible,

    // Score
    homeTeam: scoreHomeTeam,
    awayTeam: scoreAwayTeam,
    currentScore: scoreTimeline[scoreTimeline.length - 1],
    gameDate: scoreGameDate,
    gameStatusMessage,
    isGameDataLoading: isGameDataVisible,

    // Play-by-play
    awayTeamName,
    homeTeamName,
    awayActions,
    homeActions,
    allActions,
    scoreTimeline,
    awayPlayerTimeline,
    homePlayerTimeline,
    numQs,
    lastAction,
    playByPlaySectionRef,
    playByPlaySectionWidth,
    isPlayLoading: isPlayVisible,
    showScoreDiff,
    gameStatus: currentScheduleGameStatus,
    nbaGameId,

    // Stat controls
    statOn,
    changeStatOn,
    setShowScoreDiff,

    // Box score
    box,
    isBoxLoading: isBoxVisible,
  };
}
