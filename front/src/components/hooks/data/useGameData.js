import { useState, useCallback } from 'react';
import { PREFIX } from '../../../environment';
import { GAME_NOT_STARTED_MESSAGE } from '../../../domain/game-selection/status';
import { classifyFetchResult, fetchJson } from '../../../data/apiClient';
import { adaptGamePackPayload, DEFAULT_GAMEPACK_STATE } from '../../../data/gamepackAdapter';
import { normalizeSchedulePayload } from '../../../data/scheduleAdapter';

/**
 * Hook for fetching and managing game data (box score, play-by-play, and schedule)
 */
export function useGameData() {
  const [box, setBox] = useState(DEFAULT_GAMEPACK_STATE.box);
  const [playByPlay, setPlayByPlay] = useState(DEFAULT_GAMEPACK_STATE.playByPlay);
  const [awayTeamId, setAwayTeamId] = useState(DEFAULT_GAMEPACK_STATE.awayTeamId);
  const [homeTeamId, setHomeTeamId] = useState(DEFAULT_GAMEPACK_STATE.homeTeamId);
  const [nbaGameId, setNbaGameId] = useState(DEFAULT_GAMEPACK_STATE.nbaGameId);
  const [numPeriods, setNumPeriods] = useState(DEFAULT_GAMEPACK_STATE.numPeriods);
  const [lastAction, setLastAction] = useState(DEFAULT_GAMEPACK_STATE.lastAction);
  const [gameStatusMessage, setGameStatusMessage] = useState(null);

  const [schedule, setSchedule] = useState([]);
  const [isScheduleLoading, setIsScheduleLoading] = useState(false);

  const [isBoxLoading, setIsBoxLoading] = useState(true);
  const [isPlayLoading, setIsPlayLoading] = useState(true);

  const applyGameDataState = useCallback((state) => {
    setBox(state.box);
    setPlayByPlay(state.playByPlay);
    setAwayTeamId(state.awayTeamId);
    setHomeTeamId(state.homeTeamId);
    setNbaGameId(state.nbaGameId);
    setNumPeriods(state.numPeriods);
    setLastAction(state.lastAction);
  }, []);

  const transitionGameLoading = useCallback((showLoading) => {
    if (showLoading) {
      setIsBoxLoading(true);
      setIsPlayLoading(true);
    }
    setGameStatusMessage(null);
  }, []);

  const transitionGameNotStarted = useCallback(() => {
    setGameStatusMessage(GAME_NOT_STARTED_MESSAGE);
    applyGameDataState(DEFAULT_GAMEPACK_STATE);
  }, [applyGameDataState]);

  const transitionGameSuccess = useCallback((payload) => {
    const adapted = adaptGamePackPayload(payload);
    setGameStatusMessage(null);
    setNbaGameId(adapted.nbaGameId);

    if (adapted.hasBoxData) {
      setBox(adapted.boxData);
      setAwayTeamId(adapted.awayTeamId);
      setHomeTeamId(adapted.homeTeamId);
    }

    if (adapted.hasPlayData) {
      setNumPeriods(adapted.numPeriods);
      setLastAction(adapted.lastAction);
      setPlayByPlay(adapted.playData);
    }
  }, []);

  const transitionGameError = useCallback((errorLike) => {
    console.error('Error in fetchGamePack:', errorLike);
  }, []);

  const completeGameLoading = useCallback((showLoading) => {
    if (!showLoading) {
      return;
    }
    setIsBoxLoading(false);
    setIsPlayLoading(false);
  }, []);

  const fetchSchedule = useCallback(async (dateString) => {
    if (!dateString) return;

    setIsScheduleLoading(true);
    const url = `${PREFIX}/schedule/${dateString}.json.gz`;

    try {
      const result = await fetchJson(url);
      const outcome = classifyFetchResult(result);

      if (outcome === 'success') {
        setSchedule(normalizeSchedulePayload(result.data));
        return;
      }

      if (outcome === 'not-available') {
        setSchedule([]);
        return;
      }

      console.error(
        'Error in fetchSchedule:',
        result.error || `Schedule fetch failed: ${result.status}`,
      );
      setSchedule([]);
    } finally {
      setIsScheduleLoading(false);
    }
  }, []);

  const fetchGamePack = useCallback(
    async ({ gameId, url, showLoading = true } = {}) => {
      if (!gameId && !url) return;
      const requestUrl = url || `${PREFIX}/data/gamepack/${gameId}.json.gz`;
      transitionGameLoading(showLoading);

      try {
        const result = await fetchJson(requestUrl);
        const outcome = classifyFetchResult(result);

        if (outcome === 'not-available') {
          transitionGameNotStarted();
          return;
        }

        if (outcome !== 'success') {
          transitionGameError(result.error || new Error(`S3 fetch failed: ${result.status}`));
          return;
        }

        transitionGameSuccess(result.data);
      } finally {
        completeGameLoading(showLoading);
      }
    },
    [
      completeGameLoading,
      transitionGameError,
      transitionGameLoading,
      transitionGameNotStarted,
      transitionGameSuccess,
    ],
  );

  const setGameNotStarted = useCallback(() => {
    transitionGameNotStarted();
    setIsBoxLoading(false);
    setIsPlayLoading(false);
  }, [transitionGameNotStarted]);

  /**
   * Reset loading states when game changes
   */
  const resetLoadingStates = useCallback(() => {
    setIsBoxLoading(true);
    setIsPlayLoading(true);
    setGameStatusMessage(null);
    setNbaGameId(null);
  }, []);

  return {
    box,
    playByPlay,
    schedule,
    awayTeamId,
    homeTeamId,
    nbaGameId,
    numPeriods,
    lastAction,
    gameStatusMessage,
    isBoxLoading,
    isPlayLoading,
    isScheduleLoading,
    fetchGamePack,
    setGameNotStarted,
    fetchSchedule,
    resetLoadingStates,
  };
}
