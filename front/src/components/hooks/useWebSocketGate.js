import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getNbaTodayString,
  parseGameStatus,
  parseStartTimeEt,
  scheduleMatchesDate,
} from '../../helpers/gameSelectionUtils';

export function useWebSocketGate({
  date,
  schedule,
  gameId,
  selectedGameDate,
  selectedGameStart,
  selectedGameStatus,
  selectedGameMetaId,
}) {
  const [enabled, setEnabled] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const gateState = useMemo(() => {
    const nbaToday = getNbaTodayString();
    let nextFollowDate = false;
    let nextFollowGame = false;
    let dateConnectAt = null;
    let gameConnectAt = null;

    if (date && date === nbaToday && schedule && schedule.length > 0 && scheduleMatchesDate(schedule, date)) {
      const allFinal = schedule.every((game) => parseGameStatus(game?.status).isFinal);
      if (!allFinal) {
        let earliestStart = null;
        let anyLive = false;

        for (const game of schedule) {
          const status = parseGameStatus(game?.status);
          if (status.isLive) {
            anyLive = true;
          }
          const start = parseStartTimeEt(game?.starttime);
          if (!start) {
            continue;
          }
          if (!earliestStart || start < earliestStart) {
            earliestStart = start;
          }
        }

        if (anyLive) {
          nextFollowDate = true;
          dateConnectAt = new Date();
        } else if (earliestStart) {
          nextFollowDate = true;
          dateConnectAt = earliestStart;
        }
      }
    }

    const metaMatchesGame =
      selectedGameMetaId && gameId && String(selectedGameMetaId) === String(gameId);
    const fallbackStatus = metaMatchesGame ? selectedGameStatus : null;
    const fallbackStart = metaMatchesGame ? selectedGameStart : null;

    let matchedGame = null;
    let matchedGameDate = null;
    const scheduleIsCurrent = scheduleMatchesDate(schedule, date);
    if (gameId && scheduleIsCurrent) {
      matchedGame = schedule.find((game) => String(game?.id) === String(gameId)) || null;
      if (matchedGame) {
        matchedGameDate = date;
      }
    }

    const resolvedStatus = matchedGame?.status ?? fallbackStatus;
    const resolvedStart = matchedGame?.starttime
      ? parseStartTimeEt(matchedGame.starttime)
      : fallbackStart;
    const resolvedGameDate = matchedGameDate ?? (metaMatchesGame ? selectedGameDate : null);

    if (gameId && resolvedGameDate && resolvedGameDate === nbaToday) {
      const isFinal = resolvedStatus
        ? parseGameStatus(resolvedStatus).isFinal
        : false;
      if (!isFinal) {
        const status = resolvedStatus ? parseGameStatus(resolvedStatus) : null;
        if (status?.isLive) {
          nextFollowGame = true;
          gameConnectAt = new Date();
        } else if (resolvedStart) {
          nextFollowGame = true;
          gameConnectAt = resolvedStart;
        }
      }
    }

    let connectAt = null;
    if (nextFollowDate && nextFollowGame) {
      if (!dateConnectAt) {
        connectAt = gameConnectAt;
      } else if (!gameConnectAt) {
        connectAt = dateConnectAt;
      } else {
        connectAt = dateConnectAt < gameConnectAt ? dateConnectAt : gameConnectAt;
      }
    } else if (nextFollowDate) {
      connectAt = dateConnectAt;
    } else {
      connectAt = gameConnectAt;
    }

    return {
      followDate: nextFollowDate,
      followGame: nextFollowGame,
      connectAt,
    };
  }, [
    date,
    schedule,
    gameId,
    selectedGameDate,
    selectedGameStart,
    selectedGameStatus,
    selectedGameMetaId,
  ]);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!gateState.followDate && !gateState.followGame) {
      setEnabled(false);
      return;
    }

    const { connectAt } = gateState;
    if (!connectAt) {
      setEnabled(false);
      return;
    }

    const now = new Date();
    if (connectAt <= now) {
      setEnabled(true);
      return;
    }

    setEnabled(false);
    timerRef.current = setTimeout(() => {
      setEnabled(true);
    }, connectAt.getTime() - now.getTime());
  }, [gateState]);

  return {
    enabled,
    followDate: gateState.followDate,
    followGame: gateState.followGame,
  };
}
