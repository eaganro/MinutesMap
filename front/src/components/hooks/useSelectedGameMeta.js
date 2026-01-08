import { useEffect, useRef, useState } from 'react';
import { getNbaTodayString, parseStartTimeEt } from '../../helpers/gameSelectionUtils';

export function useSelectedGameMeta({ gameId, date, schedule, todaySchedule }) {
  const [selectedGameDate, setSelectedGameDate] = useState(null);
  const [selectedGameStart, setSelectedGameStart] = useState(null);
  const [selectedGameStatus, setSelectedGameStatus] = useState(null);
  const [selectedGameMetaId, setSelectedGameMetaId] = useState(null);
  const prevGameIdRef = useRef(gameId);

  useEffect(() => {
    if (!gameId) {
      setSelectedGameDate(null);
      setSelectedGameStart(null);
      setSelectedGameStatus(null);
      setSelectedGameMetaId(null);
      prevGameIdRef.current = gameId;
      return;
    }

    const gameChanged = prevGameIdRef.current !== gameId;
    if (gameChanged) {
      if (date) {
        setSelectedGameDate(date);
      }
      setSelectedGameStart(null);
      setSelectedGameStatus(null);
      setSelectedGameMetaId(null);
    } else if (!selectedGameDate && date) {
      setSelectedGameDate(date);
    }

    prevGameIdRef.current = gameId;
  }, [gameId, date, selectedGameDate]);

  useEffect(() => {
    if (!gameId || !date) {
      return;
    }

    const tryUpdateFromSchedule = (games, dateValue) => {
      if (!games || games.length === 0) {
        return false;
      }
      const match = games.find((game) => String(game.id) === String(gameId));
      if (!match) {
        return false;
      }

      setSelectedGameStart(parseStartTimeEt(match.starttime));
      setSelectedGameStatus(match.status || null);
      setSelectedGameDate(dateValue);
      setSelectedGameMetaId(match.id ?? null);
      return true;
    };

    const updated = tryUpdateFromSchedule(schedule, date);
    if (!updated) {
      const nbaToday = getNbaTodayString();
      if (todaySchedule && nbaToday) {
        tryUpdateFromSchedule(todaySchedule, nbaToday);
      }
    }
  }, [gameId, schedule, todaySchedule, date]);

  return {
    selectedGameDate,
    selectedGameStart,
    selectedGameStatus,
    selectedGameMetaId,
  };
}
