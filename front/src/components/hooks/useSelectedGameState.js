import { useState, useEffect, useMemo, useCallback } from 'react';
import { parseGameStatus } from '../../domain/game-selection/status';

export function useSelectedGameState({ initialGameId, schedule, resetLoadingStates }) {
  const [gameId, setGameId] = useState(initialGameId || null);
  const [cachedGameMeta, setCachedGameMeta] = useState(null);

  const selectedScheduleGame = useMemo(() => {
    if (!gameId) {
      return null;
    }
    const scheduleMatch = (schedule || []).find((game) => String(game?.id) === String(gameId));
    if (scheduleMatch) {
      return scheduleMatch;
    }
    return null;
  }, [gameId, schedule]);

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

  const cachedMetaForGame =
    cachedGameMeta && String(cachedGameMeta.id) === String(gameId) ? cachedGameMeta : null;
  const stableGameMeta = selectedScheduleGame || cachedMetaForGame;
  const currentScheduleGameStatus = stableGameMeta?.status || null;

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
      normalized === 'scheduled' || normalized.startsWith('scheduled') || normalized.includes('tbd')
    );
  }, [selectedScheduleGame?.status]);

  const isSelectedGameFinal = useMemo(() => {
    if (!gameId) {
      return true;
    }
    if (!currentScheduleGameStatus) {
      return false;
    }
    return parseGameStatus(currentScheduleGameStatus).isFinal;
  }, [gameId, currentScheduleGameStatus]);

  const changeGame = useCallback(
    (id) => {
      if (!id || id === gameId) return;
      resetLoadingStates();
      setGameId(id);
    },
    [gameId, resetLoadingStates],
  );

  return {
    gameId,
    setGameId,
    changeGame,
    selectedScheduleGame,
    stableGameMeta,
    currentScheduleGameStatus,
    isSelectedGameUpcoming,
    isSelectedGameFinal,
  };
}
