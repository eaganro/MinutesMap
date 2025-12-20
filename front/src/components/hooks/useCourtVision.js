import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getTodayString, sortGamesForSelection } from '../../helpers/gameSelectionUtils';
import { PREFIX } from '../../environment';

import { useQueryParams } from './useQueryParams';
import { useLocalStorageState } from './useLocalStorageState';
import { useGameData } from './useGameData';
import { useWebSocket } from './useWebSocket';
import { useAutoSelectGame } from './useAutoSelectGame';
import { useGameTimeline } from './useGameTimeline';
import { useElementWidth } from './useElementWidth';

const DEFAULT_STAT_ON = [true, false, true, true, false, false, false, false];
const LOADING_DELAY_MS = 500;

/**
 * Facade hook that orchestrates all game data, WebSocket, and UI state.
 * This is the single point of entry for the App component - it handles
 * all internal wiring between smaller hooks so the component can focus on layout.
 */
export function useCourtVision() {
  // === INITIALIZATION ===
  const { getInitialParams, updateQueryParams } = useQueryParams();
  const initialParams = useMemo(() => getInitialParams(), []);
  const today = useMemo(() => getTodayString(), []);

  // === CORE STATE ===
  const [date, setDate] = useState(initialParams.date || today);
  const [games, setGames] = useState([]);
  const [gameId, setGameId] = useState(initialParams.gameId || null);
  const [isScheduleLoading, setIsScheduleLoading] = useState(true);
  const [showLoading, setShowLoading] = useState(false);

  // === USER PREFERENCES ===
  const [statOn, setStatOn] = useLocalStorageState('statOn', DEFAULT_STAT_ON);
  const [showScoreDiff, setShowScoreDiff] = useLocalStorageState('showScoreDiff', true);

  // === GAME DATA ===
  const {
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

  // === AUTO-SELECT GAME ===
  const handleLookbackDate = useCallback((newDate) => {
    setIsScheduleLoading(true);
    setDate(newDate);
  }, []);

  const { attemptAutoSelect, disableAutoSelect } = useAutoSelectGame({
    initialDate: initialParams.date || today,
    initialGameId: initialParams.gameId,
    date,
    gameId,
    onSelectGame: setGameId,
    onLookbackDate: handleLookbackDate,
  });

  // === WEBSOCKET HANDLERS ===
  const handlePlayByPlayUpdate = useCallback((key, version) => {
    const url = `${PREFIX}/${encodeURIComponent(key)}?v=${version}`;
    fetchPlayByPlay(url, gameIdRef.current, () => wsCloseRef.current());
  }, [fetchPlayByPlay]);

  const handleBoxUpdate = useCallback((key, version) => {
    const url = `${PREFIX}/${encodeURIComponent(key)}?v=${version}`;
    fetchBox(url);
  }, [fetchBox]);

  const handleDateUpdate = useCallback((data, scheduleDate) => {
    setGames(data);
    setIsScheduleLoading(false);
    attemptAutoSelect(data, scheduleDate);
  }, [attemptAutoSelect]);

  // === WEBSOCKET CONNECTION ===
  const { close: wsClose } = useWebSocket({
    gameId,
    date,
    onPlayByPlayUpdate: handlePlayByPlayUpdate,
    onBoxUpdate: handleBoxUpdate,
    onDateUpdate: handleDateUpdate,
  });

  // Store wsClose in ref for use in callbacks
  useEffect(() => { wsCloseRef.current = wsClose; }, [wsClose]);

  // === URL SYNC ===
  useEffect(() => {
    updateQueryParams(date, gameId);
  }, [date, gameId, updateQueryParams]);

  // === GAME DATA FETCHING ===
  useEffect(() => {
    if (gameId) {
      fetchBoth(gameId);
    }
  }, [gameId, fetchBoth]);

  // === SCHEDULE LOADING DELAY (avoid flash) ===
  useEffect(() => {
    if (isScheduleLoading) {
      const timer = setTimeout(() => setShowLoading(true), LOADING_DELAY_MS);
      return () => clearTimeout(timer);
    }
    setShowLoading(false);
  }, [isScheduleLoading]);

  // === PUBLIC EVENT HANDLERS ===
  const changeDate = useCallback((e) => {
    const newDate = e.target.value;
    if (newDate === date) return;
    
    disableAutoSelect();
    setIsScheduleLoading(true);
    setDate(newDate);
  }, [date, disableAutoSelect]);

  const changeGame = useCallback((id) => {
    disableAutoSelect();
    
    if (!id || id === gameId) return;
    
    resetLoadingStates();
    setGameId(id);
  }, [gameId, resetLoadingStates, disableAutoSelect]);

  const changeStatOn = useCallback((index) => {
    setStatOn(prev => {
      const updated = [...prev];
      updated[index] = !updated[index];
      return updated;
    });
  }, [setStatOn]);

  // === COMPUTED VALUES ===
  const sortedGames = useMemo(() => sortGamesForSelection(games), [games]);

  const awayTeamName = useMemo(() => ({
    name: box?.awayTeam?.teamName || 'Away Team',
    abr: box?.awayTeam?.teamTricode || '',
  }), [box?.awayTeam]);

  const homeTeamName = useMemo(() => ({
    name: box?.homeTeam?.teamName || 'Home Team',
    abr: box?.homeTeam?.teamTricode || '',
  }), [box?.homeTeam]);

  const isScheduleVisible = isScheduleLoading && showLoading;
  const isGameDataVisible = isBoxLoading || isPlayLoading;
  const isPlayVisible = isPlayLoading;
  const isBoxVisible = isBoxLoading;

  // === PUBLIC API ===
  return {
    // Schedule
    games: sortedGames,
    date,
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
