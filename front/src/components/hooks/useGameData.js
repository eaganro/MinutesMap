import { useState, useRef, useCallback } from 'react';
import { PREFIX } from '../../environment';
import { GAME_NOT_STARTED_MESSAGE } from '../../helpers/gameSelectionUtils';

/**
 * Hook for fetching and managing game data (box score and play-by-play)
 */
export function useGameData() {
  const [box, setBox] = useState({});
  const [playByPlay, setPlayByPlay] = useState([]);
  const [awayTeamId, setAwayTeamId] = useState(null);
  const [homeTeamId, setHomeTeamId] = useState(null);
  const [numQs, setNumQs] = useState(4);
  const [lastAction, setLastAction] = useState(null);
  const [gameStatusMessage, setGameStatusMessage] = useState(null);
  
  const [isBoxLoading, setIsBoxLoading] = useState(true);
  const [isPlayLoading, setIsPlayLoading] = useState(true);
  const [isPlayRefreshing, setIsPlayRefreshing] = useState(false);
  
  const latestBoxRef = useRef(box);
  const latestPlayByPlayRef = useRef(playByPlay);

  // Keep refs in sync
  latestBoxRef.current = box;
  latestPlayByPlayRef.current = playByPlay;

  /**
   * Fetch both box score and play-by-play data for a game
   */
  const fetchBoth = useCallback(async (gameId) => {
    if (!gameId) return;
    
    const boxUrl = `${PREFIX}/data/boxData/${gameId}.json.gz`;
    const playUrl = `${PREFIX}/data/playByPlayData/${gameId}.json.gz`;

    setIsBoxLoading(true);
    setIsPlayLoading(true);
    setIsPlayRefreshing(false);
    setGameStatusMessage(null);

    try {
      const [boxRes, playResRaw] = await Promise.all([
        fetch(boxUrl),
        fetch(playUrl),
      ]);

      if (boxRes.status === 403 || boxRes.status === 404) {
        setGameStatusMessage(GAME_NOT_STARTED_MESSAGE);
        setBox({});
        setAwayTeamId(null);
        setHomeTeamId(null);
        setPlayByPlay([]);
        setLastAction(null);
        setNumQs(4);
        setIsBoxLoading(false);
        setIsPlayLoading(false);
        return;
      }

      if (!boxRes.ok) throw new Error(`S3 fetch failed: ${boxRes.status}`);
      const boxData = await boxRes.json();
      setBox(boxData);
      setAwayTeamId(boxData.awayTeamId ?? boxData.awayTeam.teamId);
      setHomeTeamId(boxData.homeTeamId ?? boxData.homeTeam.teamId);
      setIsBoxLoading(false);

      if (playResRaw.status === 403) {
        setGameStatusMessage(GAME_NOT_STARTED_MESSAGE);
        setPlayByPlay([]);
        setLastAction(null);
        setNumQs(4);
        setIsPlayLoading(false);
        return;
      }

      if (playResRaw.status === 404) {
        setPlayByPlay([]);
        setLastAction(null);
        setNumQs(4);
        setIsPlayLoading(false);
        return;
      }

      if (!playResRaw.ok) throw new Error(`S3 fetch failed: ${playResRaw.status}`);
      const playData = await playResRaw.json();
      if (playData) {
        const last = playData[playData.length - 1] || null;
        setNumQs(last?.period > 4 ? last?.period : 4);
        setLastAction(last);
        setPlayByPlay(playData);
      }
      setIsPlayLoading(false);
    } catch (err) {
      console.error('Error in fetchBoth:', err);
      setIsBoxLoading(false);
      setIsPlayLoading(false);
    }
  }, []);

  /**
   * Fetch play-by-play data from a specific URL
   */
  const fetchPlayByPlay = useCallback(async (url, gameId, onGameEnd) => {
    const hasExistingData = latestPlayByPlayRef.current.length > 0;
    if (hasExistingData) {
      setIsPlayRefreshing(true);
    } else {
      setIsPlayLoading(true);
    }

    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 403) {
          setGameStatusMessage(GAME_NOT_STARTED_MESSAGE);
          setPlayByPlay([]);
          setLastAction(null);
          setNumQs(4);
          setIsPlayRefreshing(false);
          return;
        }
        if (res.status === 404) {
          setPlayByPlay([]);
          setLastAction(null);
          setNumQs(4);
          setIsPlayRefreshing(false);
          return;
        }
        throw new Error(`S3 fetch failed: ${res.status}`);
      }
      const playData = await res.json();

      setGameStatusMessage(null);
      const last = playData[playData.length - 1] || null;
      setNumQs(last?.period > 4 ? last?.period : 4);
      setLastAction(last);

      if (last?.status?.trim().startsWith('Final')) {
        await fetchBox(`${PREFIX}/data/boxData/${gameId}.json.gz`);
        onGameEnd?.();
      }
      setPlayByPlay(playData);
    } catch (err) {
      console.error('Error in fetchPlayByPlay:', err);
    } finally {
      setIsPlayLoading(false);
      setIsPlayRefreshing(false);
    }
  }, []);

  /**
   * Fetch box score data from a specific URL
   */
  const fetchBox = useCallback(async (url) => {
    if (!latestBoxRef.current || Object.keys(latestBoxRef.current).length === 0) {
      setIsBoxLoading(true);
    }

    try {
      const res = await fetch(url);
      if (res.status === 403 || res.status === 404) {
        setGameStatusMessage(GAME_NOT_STARTED_MESSAGE);
        setBox({});
        setAwayTeamId(null);
        setHomeTeamId(null);
        return;
      }
      if (!res.ok) throw new Error(`S3 fetch failed: ${res.status}`);
      const boxData = await res.json();
      setGameStatusMessage(null);
      setBox(boxData);
      setAwayTeamId(boxData.awayTeamId ?? boxData.awayTeam.teamId);
      setHomeTeamId(boxData.homeTeamId ?? boxData.homeTeam.teamId);
    } catch (err) {
      console.error('Error in fetchBox:', err);
    } finally {
      setIsBoxLoading(false);
    }
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
    awayTeamId,
    homeTeamId,
    numQs,
    lastAction,
    gameStatusMessage,
    
    // Loading states
    isBoxLoading,
    isPlayLoading,
    isPlayRefreshing,
    
    // Actions
    fetchBoth,
    fetchPlayByPlay,
    fetchBox,
    resetLoadingStates,
  };
}

