import { useCallback } from 'react';
import { PREFIX } from '../../../environment';
import { useSelectedGameMeta } from '../schedule/useSelectedGameMeta';
import { useWebSocket } from './useWebSocket';
import { useWebSocketGate } from './useWebSocketGate';

export function useLiveUpdates({
  gameId,
  date,
  schedule,
  fetchGamePackWithReason,
  fetchScheduleWithReason,
}) {
  const handleGameUpdate = useCallback(
    (key, version) => {
      const url = `${PREFIX}/${encodeURIComponent(key)}?v=${version}`;
      fetchGamePackWithReason({ url, showLoading: false }, 'ws');
    },
    [fetchGamePackWithReason],
  );

  const handleDateUpdate = useCallback(
    (updatedDate) => {
      if (updatedDate === date) {
        fetchScheduleWithReason(date, 'ws');
      }
    },
    [date, fetchScheduleWithReason],
  );

  const { selectedGameDate, selectedGameStart, selectedGameStatus, selectedGameMetaId } =
    useSelectedGameMeta({
      gameId,
      date,
      schedule,
    });

  const {
    enabled: wsEnabled,
    followDate: wsFollowDate,
    followGame: wsFollowGame,
  } = useWebSocketGate({
    date,
    schedule,
    gameId,
    selectedGameDate,
    selectedGameStart,
    selectedGameStatus,
    selectedGameMetaId,
  });

  const { ws } = useWebSocket({
    gameId,
    date,
    enabled: wsEnabled,
    followDate: wsFollowDate,
    followGame: wsFollowGame,
    onPlayByPlayUpdate: handleGameUpdate,
    onDateUpdate: handleDateUpdate,
  });

  return {
    ws,
  };
}
