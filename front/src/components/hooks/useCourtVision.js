import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { sortGamesForSelection } from '../../helpers/gameSelectionUtils';
import { PREFIX } from '../../environment';

import { useQueryParams } from './useQueryParams';
import { useLocalStorageState } from './useLocalStorageState';
import { useGameData } from './useGameData';
import { useWebSocket } from './useWebSocket';
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
    numQs,
    lastAction,
    gameStatusMessage,
    isBoxLoading,
    isPlayLoading,
    fetchBoth,
    fetchPlayByPlay,
    fetchBox,
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
  const gameIdRef = useRef(gameId);
  const wsCloseRef = useRef(() => {});
  useEffect(() => { gameIdRef.current = gameId; }, [gameId]);

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
            setGameId(data.autoSelectGameId);
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
  const handlePlayByPlayUpdate = useCallback((key, version) => {
    const url = `${PREFIX}/${encodeURIComponent(key)}?v=${version}`;
    fetchPlayByPlay(url, gameIdRef.current, () => wsCloseRef.current());
  }, [fetchPlayByPlay]);

  const handleBoxUpdate = useCallback((key, version) => {
    const url = `${PREFIX}/${encodeURIComponent(key)}?v=${version}`;
    fetchBox(url);
  }, [fetchBox]);

  const handleDateUpdate = useCallback((updatedDate) => {
    // If we receive a signal that the date we are viewing changed, refresh it
    if (updatedDate === date) {
      fetchSchedule(date);
    }
  }, [date, fetchSchedule]);

  // === WEBSOCKET CONNECTION ===
  const { close: wsClose } = useWebSocket({
    gameId,
    date,
    onPlayByPlayUpdate: handlePlayByPlayUpdate,
    onBoxUpdate: handleBoxUpdate,
    onDateUpdate: handleDateUpdate,
  });

  useEffect(() => { wsCloseRef.current = wsClose; }, [wsClose]);

  // === URL SYNC ===
  useEffect(() => {
    if (date) {
      updateQueryParams(date, gameId);
    }
  }, [date, gameId, updateQueryParams]);

  // === GAME DATA FETCHING ===
  useEffect(() => {
    if (gameId) {
      fetchBoth(gameId);
    }
  }, [gameId, fetchBoth]);

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

  const awayTeamName = useMemo(() => ({
    name: box?.awayTeam?.teamName || 'Away Team',
    abr: box?.awayTeam?.teamTricode || '',
  }), [box?.awayTeam]);

  const homeTeamName = useMemo(() => ({
    name: box?.homeTeam?.teamName || 'Home Team',
    abr: box?.homeTeam?.teamTricode || '',
  }), [box?.homeTeam]);

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
    homeTeam: box?.homeTeam?.teamTricode,
    awayTeam: box?.awayTeam?.teamTricode,
    currentScore: scoreTimeline[scoreTimeline.length - 1],
    gameDate: box?.gameEt,
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

    // Stat controls
    statOn,
    changeStatOn,
    setShowScoreDiff,

    // Box score
    box,
    isBoxLoading: isBoxVisible,
  };
}
