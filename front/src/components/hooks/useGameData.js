import { useState, useCallback } from 'react';
import { PREFIX } from '../../environment';
import { GAME_NOT_STARTED_MESSAGE } from '../../helpers/gameSelectionUtils';

/**
 * Hook for fetching and managing game data (box score, play-by-play, and schedule)
 */
export function useGameData() {
  // --- Game Detail State ---
  const [box, setBox] = useState({});
  const [playByPlay, setPlayByPlay] = useState([]);
  const [awayTeamId, setAwayTeamId] = useState(null);
  const [homeTeamId, setHomeTeamId] = useState(null);
  const [numQs, setNumQs] = useState(4);
  const [lastAction, setLastAction] = useState(null);
  const [gameStatusMessage, setGameStatusMessage] = useState(null);
  
  // --- Schedule State ---
  const [schedule, setSchedule] = useState([]);
  const [isScheduleLoading, setIsScheduleLoading] = useState(false);
  const [todaySchedule, setTodaySchedule] = useState([]);
  const [isTodayScheduleLoading, setIsTodayScheduleLoading] = useState(false);

  // --- Loading States ---
  const [isBoxLoading, setIsBoxLoading] = useState(true);
  const [isPlayLoading, setIsPlayLoading] = useState(true);
  
  const readPlayMeta = useCallback((payload) => {
    if (payload?.v === 2) {
      const last = payload.last;
      return {
        lastAction: last
          ? {
              period: last.quarter ?? last.period,
              clock: last.time ?? last.clock,
              scoreAway: last.awayScore,
              scoreHome: last.homeScore,
            }
          : null,
        numPeriods: payload.periods ?? 4,
      };
    }
    if (payload?.schemaVersion === 1) {
      return {
        lastAction: payload.lastAction ?? null,
        numPeriods: payload.numPeriods ?? 4,
      };
    }
    return { lastAction: null, numPeriods: 4 };
  }, []);

  const unpackGamePack = useCallback((payload) => {
    if (!payload || typeof payload !== 'object') {
      return { boxData: null, playData: null };
    }
    if (payload.box || payload.flow) {
      return {
        boxData: payload.box ?? null,
        playData: payload.flow ?? null,
      };
    }
    if (payload.teams && payload.id) {
      return { boxData: payload, playData: null };
    }
    if (payload.v === 2 || payload.schemaVersion === 1) {
      return { boxData: null, playData: payload };
    }
    return { boxData: null, playData: null };
  }, []);

  const applyGamePack = useCallback((payload) => {
    const { boxData, playData } = unpackGamePack(payload);
    if (boxData) {
      setBox(boxData);
      setAwayTeamId(boxData?.teams?.away?.id ?? null);
      setHomeTeamId(boxData?.teams?.home?.id ?? null);
    }
    if (playData) {
      const { lastAction: last, numPeriods } = readPlayMeta(playData);
      setNumQs(numPeriods);
      setLastAction(last);
      setPlayByPlay(playData);
    }
  }, [readPlayMeta, unpackGamePack]);

  /**
   * Fetch daily schedule from S3
   * @param {string} dateString - Format 'YYYY-MM-DD'
   */
  const fetchSchedule = useCallback(async (dateString) => {
    if (!dateString) return;

    setIsScheduleLoading(true);
    const url = `${PREFIX}/schedule/${dateString}.json.gz`;

    try {
      const res = await fetch(url);
      
      // Handle cases where schedule doesn't exist yet (e.g. far future)
      if (res.status === 403 || res.status === 404) {
        setSchedule([]);
        return;
      }

      if (!res.ok) throw new Error(`Schedule fetch failed: ${res.status}`);
      
      const data = await res.json();
      setSchedule(data);
    } catch (err) {
      console.error('Error in fetchSchedule:', err);
      setSchedule([]);
    } finally {
      setIsScheduleLoading(false);
    }
  }, []);

  const fetchTodaySchedule = useCallback(async (dateString) => {
    if (!dateString) return;

    setIsTodayScheduleLoading(true);
    const url = `${PREFIX}/schedule/${dateString}.json.gz`;

    try {
      const res = await fetch(url);
      if (res.status === 403 || res.status === 404) {
        setTodaySchedule([]);
        return;
      }

      if (!res.ok) throw new Error(`Schedule fetch failed: ${res.status}`);

      const data = await res.json();
      setTodaySchedule(data);
    } catch (err) {
      console.error('Error in fetchTodaySchedule:', err);
      setTodaySchedule([]);
    } finally {
      setIsTodayScheduleLoading(false);
    }
  }, []);

  /**
   * Fetch combined game pack data for a game (box + play-by-play)
   */
  const fetchGamePack = useCallback(async ({ gameId, url, showLoading = true } = {}) => {
    if (!gameId && !url) return;
    const requestUrl = url || `${PREFIX}/data/gamepack/${gameId}.json.gz`;

    if (showLoading) {
      setIsBoxLoading(true);
      setIsPlayLoading(true);
    }
    setGameStatusMessage(null);

    try {
      const res = await fetch(requestUrl);
      if (res.status === 403 || res.status === 404) {
        setGameStatusMessage(GAME_NOT_STARTED_MESSAGE);
        setBox({});
        setAwayTeamId(null);
        setHomeTeamId(null);
        setPlayByPlay([]);
        setLastAction(null);
        setNumQs(4);
        if (showLoading) {
          setIsBoxLoading(false);
          setIsPlayLoading(false);
        }
        return;
      }

      if (!res.ok) throw new Error(`S3 fetch failed: ${res.status}`);
      const payload = await res.json();
      setGameStatusMessage(null);
      applyGamePack(payload);
    } catch (err) {
      console.error('Error in fetchGamePack:', err);
    }
    if (showLoading) {
      setIsBoxLoading(false);
      setIsPlayLoading(false);
    }
  }, [applyGamePack]);

  const setGameNotStarted = useCallback(() => {
    setGameStatusMessage(GAME_NOT_STARTED_MESSAGE);
    setBox({});
    setAwayTeamId(null);
    setHomeTeamId(null);
    setPlayByPlay([]);
    setLastAction(null);
    setNumQs(4);
    setIsBoxLoading(false);
    setIsPlayLoading(false);
  }, []);

  /**
   * Reset loading states when game changes
   */
  const resetLoadingStates = useCallback(() => {
    setIsBoxLoading(true);
    setIsPlayLoading(true);
    setGameStatusMessage(null);
  }, []);

  return {
    // Data
    box,
    playByPlay,
    schedule,
    awayTeamId,
    homeTeamId,
    numQs,
    lastAction,
    gameStatusMessage,
    
    // Loading states
    isBoxLoading,
    isPlayLoading,
    isScheduleLoading,
    isTodayScheduleLoading,
    todaySchedule,
    
    // Actions
    fetchGamePack,
    setGameNotStarted,
    fetchSchedule,
    fetchTodaySchedule,
    resetLoadingStates,
  };
}
