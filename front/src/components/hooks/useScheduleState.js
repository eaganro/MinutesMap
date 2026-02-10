import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  parseGameSlug,
  scheduleMatchesDate,
  sortGamesForSelection,
} from '../../domain/game-selection/status';
import { PREFIX } from '../../environment';

export function useScheduleState({
  initialDate,
  initialGameId,
  gameId,
  setGameId,
  schedule,
  isScheduleLoading,
  fetchScheduleWithReason,
}) {
  // Start null if no URL params; wait for init.json to provide the date.
  const [date, setDate] = useState(initialDate || null);
  const [isInitLoading, setIsInitLoading] = useState(!initialDate);

  useEffect(() => {
    if (date) return;

    const fetchInitState = async () => {
      try {
        const res = await fetch(`${PREFIX}/data/init.json`);
        if (res.ok) {
          const data = await res.json();
          setDate(data.date);
          if (data.autoSelectGameId && !initialGameId) {
            const slugParams = parseGameSlug(data.autoSelectGameId);
            if (slugParams) {
              setGameId(slugParams.gameId);
            }
          }
        } else {
          setDate(new Date().toISOString().split('T')[0]);
        }
      } catch (err) {
        console.error('Init fetch failed:', err);
        setDate(new Date().toISOString().split('T')[0]);
      } finally {
        setIsInitLoading(false);
      }
    };

    fetchInitState();
  }, [date, initialGameId, setGameId]);

  useEffect(() => {
    if (date) {
      fetchScheduleWithReason(date, 'date-change');
    }
  }, [date, fetchScheduleWithReason]);

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
  }, [date, gameId, isScheduleLoading, sortedGames, setGameId]);

  const changeDate = useCallback(
    (newDate) => {
      if (!newDate || newDate === date) {
        return;
      }
      setDate(newDate);
    },
    [date],
  );

  return {
    date,
    isInitLoading,
    changeDate,
    sortedGames,
  };
}
