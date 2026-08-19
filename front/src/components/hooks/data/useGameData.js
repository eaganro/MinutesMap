import { useState, useCallback, useEffect, useRef } from 'react';
import { PREFIX } from '../../../environment';
import { GAME_NOT_STARTED_MESSAGE } from '../../../domain/game-selection/status';
import { classifyFetchResult, fetchJson, isAbortError } from '../../../data/apiClient';
import { adaptGamePackPayload, DEFAULT_GAMEPACK_STATE } from '../../../data/gamepackAdapter';
import { normalizeSchedulePayload } from '../../../data/scheduleAdapter';

/**
 * Hook for fetching and managing game data (box score, play-by-play, and schedule)
 */
export function useGameData() {
  const scheduleRequestRef = useRef({ id: 0, controller: null });
  const gameRequestRef = useRef({ id: 0, controller: null, completesLoading: false });

  const [box, setBox] = useState(DEFAULT_GAMEPACK_STATE.box);
  const [playByPlay, setPlayByPlay] = useState(DEFAULT_GAMEPACK_STATE.playByPlay);
  const [awayTeamId, setAwayTeamId] = useState(DEFAULT_GAMEPACK_STATE.awayTeamId);
  const [homeTeamId, setHomeTeamId] = useState(DEFAULT_GAMEPACK_STATE.homeTeamId);
  const [nbaGameId, setNbaGameId] = useState(DEFAULT_GAMEPACK_STATE.nbaGameId);
  const [numPeriods, setNumPeriods] = useState(DEFAULT_GAMEPACK_STATE.numPeriods);
  const [lastAction, setLastAction] = useState(DEFAULT_GAMEPACK_STATE.lastAction);
  const [captions, setCaptions] = useState(DEFAULT_GAMEPACK_STATE.captions);
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
    setCaptions(state.captions);
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
      setCaptions(adapted.captions);
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

  const cancelGameRequest = useCallback(() => {
    const current = gameRequestRef.current;
    current.controller?.abort();
    gameRequestRef.current = {
      id: current.id + 1,
      controller: null,
      completesLoading: false,
    };
  }, []);

  useEffect(
    () => () => {
      const scheduleRequest = scheduleRequestRef.current;
      scheduleRequest.controller?.abort();
      scheduleRequestRef.current = {
        id: scheduleRequest.id + 1,
        controller: null,
      };
      cancelGameRequest();
    },
    [cancelGameRequest],
  );

  const fetchSchedule = useCallback(async (dateString) => {
    if (!dateString) return;

    const previousRequest = scheduleRequestRef.current;
    previousRequest.controller?.abort();
    const request = {
      id: previousRequest.id + 1,
      controller: new AbortController(),
    };
    scheduleRequestRef.current = request;

    setIsScheduleLoading(true);
    const url = `${PREFIX}/schedule/${dateString}.json.gz`;

    try {
      const result = await fetchJson(url, { signal: request.controller.signal });
      if (scheduleRequestRef.current.id !== request.id) {
        return;
      }
      const outcome = classifyFetchResult(result);

      if (outcome === 'success') {
        setSchedule(normalizeSchedulePayload(result.data));
        return;
      }

      if (outcome === 'not-available') {
        setSchedule([]);
        return;
      }

      if (!isAbortError(result.error)) {
        console.error(
          'Error in fetchSchedule:',
          result.error || `Schedule fetch failed: ${result.status}`,
        );
      }
      setSchedule([]);
    } finally {
      if (scheduleRequestRef.current.id === request.id) {
        scheduleRequestRef.current = {
          id: request.id,
          controller: null,
        };
        setIsScheduleLoading(false);
      }
    }
  }, []);

  const fetchGamePack = useCallback(
    async ({ gameId, url, showLoading = true } = {}) => {
      if (!gameId && !url) return;
      const requestUrl = url || `${PREFIX}/data/gamepack/${gameId}.json.gz`;
      const previousRequest = gameRequestRef.current;
      previousRequest.controller?.abort();
      const request = {
        id: previousRequest.id + 1,
        controller: new AbortController(),
        completesLoading: showLoading || previousRequest.completesLoading,
      };
      gameRequestRef.current = request;
      transitionGameLoading(showLoading);

      try {
        const result = await fetchJson(requestUrl, { signal: request.controller.signal });
        if (gameRequestRef.current.id !== request.id) {
          return;
        }
        const outcome = classifyFetchResult(result);

        if (outcome === 'not-available') {
          transitionGameNotStarted();
          return;
        }

        if (outcome !== 'success') {
          if (!isAbortError(result.error)) {
            transitionGameError(result.error || new Error(`S3 fetch failed: ${result.status}`));
          }
          return;
        }

        transitionGameSuccess(result.data);
      } finally {
        if (gameRequestRef.current.id === request.id) {
          gameRequestRef.current = {
            id: request.id,
            controller: null,
            completesLoading: false,
          };
          completeGameLoading(request.completesLoading);
        }
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
    cancelGameRequest();
    transitionGameNotStarted();
    setIsBoxLoading(false);
    setIsPlayLoading(false);
  }, [cancelGameRequest, transitionGameNotStarted]);

  /**
   * Reset loading states when game changes
   */
  const resetLoadingStates = useCallback(() => {
    cancelGameRequest();
    setIsBoxLoading(true);
    setIsPlayLoading(true);
    setGameStatusMessage(null);
    setNbaGameId(null);
  }, [cancelGameRequest]);

  return {
    box,
    playByPlay,
    schedule,
    awayTeamId,
    homeTeamId,
    nbaGameId,
    numPeriods,
    lastAction,
    captions,
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
