import { useRef, useEffect, useCallback } from 'react';

export function useGamePackSync({
  date,
  gameId,
  selectedScheduleGame,
  isSelectedGameUpcoming,
  isScheduleLoading,
  fetchGamePack,
  fetchSchedule,
  setGameNotStarted,
}) {
  const fetchStateRef = useRef({ gameId: null, status: null });
  const lastGamePackFetchRef = useRef({ at: 0, reason: null });
  const lastScheduleFetchRef = useRef({ at: 0, reason: null });

  const fetchGamePackWithReason = useCallback(
    (params, reason) => {
      lastGamePackFetchRef.current = { at: Date.now(), reason };
      return fetchGamePack(params);
    },
    [fetchGamePack],
  );

  const fetchScheduleWithReason = useCallback(
    (dateString, reason) => {
      if (!dateString) {
        return;
      }
      lastScheduleFetchRef.current = { at: Date.now(), reason };
      return fetchSchedule(dateString);
    },
    [fetchSchedule],
  );

  useEffect(() => {
    lastGamePackFetchRef.current = { at: 0, reason: null };
  }, [gameId]);

  useEffect(() => {
    lastScheduleFetchRef.current = { at: 0, reason: null };
  }, [date]);

  const shouldWaitForSchedule = Boolean(gameId) && !selectedScheduleGame && isScheduleLoading;

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
    const previousGameId = fetchStateRef.current.gameId;
    const reason = previousGameId ? (isSameGame ? 'resume' : 'game-change') : 'initial';
    fetchStateRef.current = { gameId, status: 'fetched' };
    fetchGamePackWithReason({ gameId, showLoading: !isSameGame }, reason);
  }, [
    gameId,
    fetchGamePackWithReason,
    isSelectedGameUpcoming,
    selectedScheduleGame,
    setGameNotStarted,
    shouldWaitForSchedule,
  ]);

  return {
    fetchGamePackWithReason,
    fetchScheduleWithReason,
    lastGamePackFetchRef,
    lastScheduleFetchRef,
  };
}
