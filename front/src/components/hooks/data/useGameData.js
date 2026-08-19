import { useState, useCallback, useEffect, useRef } from 'react';
import { PREFIX } from '../../../environment';
import { GAME_NOT_STARTED_MESSAGE } from '../../../domain/game-selection/status';
import { classifyFetchResult, fetchJson, isAbortError } from '../../../data/apiClient';
import { adaptGamePackPayload, DEFAULT_GAMEPACK_STATE } from '../../../data/gamepackAdapter';
import { normalizeSchedulePayload } from '../../../data/scheduleAdapter';
import { reportError } from '../../../errors/reportError';

function createDataError(resource, outcome, result) {
  const isNetworkError = outcome === 'network-error';
  return {
    resource,
    kind: isNetworkError ? 'network' : 'http',
    status: result.status ?? null,
    message: isNetworkError
      ? 'Check your connection and try again.'
      : `The ${resource} request failed${result.status ? ` (${result.status})` : ''}.`,
  };
}

/**
 * Hook for fetching and managing game data (box score, play-by-play, and schedule)
 */
export function useGameData() {
  const scheduleRequestRef = useRef({ id: 0, controller: null });
  const gameRequestRef = useRef({ id: 0, controller: null, completesLoading: false });
  const scheduleDateRef = useRef(null);
  const loadedGameIdRef = useRef(null);

  const [box, setBox] = useState(DEFAULT_GAMEPACK_STATE.box);
  const [playByPlay, setPlayByPlay] = useState(DEFAULT_GAMEPACK_STATE.playByPlay);
  const [awayTeamId, setAwayTeamId] = useState(DEFAULT_GAMEPACK_STATE.awayTeamId);
  const [homeTeamId, setHomeTeamId] = useState(DEFAULT_GAMEPACK_STATE.homeTeamId);
  const [nbaGameId, setNbaGameId] = useState(DEFAULT_GAMEPACK_STATE.nbaGameId);
  const [numPeriods, setNumPeriods] = useState(DEFAULT_GAMEPACK_STATE.numPeriods);
  const [lastAction, setLastAction] = useState(DEFAULT_GAMEPACK_STATE.lastAction);
  const [captions, setCaptions] = useState(DEFAULT_GAMEPACK_STATE.captions);
  const [gameStatusMessage, setGameStatusMessage] = useState(null);
  const [gameDataError, setGameDataError] = useState(null);
  const [loadedGameId, setLoadedGameId] = useState(null);

  const [schedule, setSchedule] = useState([]);
  const [isScheduleLoading, setIsScheduleLoading] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState('idle');
  const [scheduleError, setScheduleError] = useState(null);

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
    setGameDataError(null);
  }, []);

  const transitionGameNotStarted = useCallback(() => {
    setGameStatusMessage(GAME_NOT_STARTED_MESSAGE);
    setGameDataError(null);
    loadedGameIdRef.current = null;
    setLoadedGameId(null);
    applyGameDataState(DEFAULT_GAMEPACK_STATE);
  }, [applyGameDataState]);

  const transitionGameSuccess = useCallback((payload, targetGameId) => {
    const adapted = adaptGamePackPayload(payload);
    setGameStatusMessage(null);
    setGameDataError(null);
    if (targetGameId) {
      const normalizedGameId = String(targetGameId);
      loadedGameIdRef.current = normalizedGameId;
      setLoadedGameId(normalizedGameId);
    }
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

  const transitionGameError = useCallback((errorLike, dataError) => {
    setGameDataError(dataError);
    reportError(errorLike, {
      boundary: 'data-fetch',
      resource: 'game data',
      error_kind: dataError.kind,
      status: dataError.status,
    });
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
    setScheduleStatus('loading');
    setScheduleError(null);
    if (scheduleDateRef.current && scheduleDateRef.current !== dateString) {
      setSchedule([]);
    }
    const url = `${PREFIX}/schedule/${dateString}.json.gz`;

    try {
      const result = await fetchJson(url, { signal: request.controller.signal });
      if (scheduleRequestRef.current.id !== request.id) {
        return;
      }
      const outcome = classifyFetchResult(result);

      if (outcome === 'success') {
        setSchedule(normalizeSchedulePayload(result.data));
        scheduleDateRef.current = dateString;
        setScheduleStatus('success');
        return;
      }

      if (outcome === 'not-available') {
        setSchedule([]);
        scheduleDateRef.current = dateString;
        setScheduleStatus('not-available');
        return;
      }

      if (isAbortError(result.error)) {
        return;
      }

      const dataError = createDataError('schedule', outcome, result);
      setScheduleError(dataError);
      setScheduleStatus('error');
      setSchedule([]);
      reportError(result.error || new Error(`Schedule fetch failed: ${result.status}`), {
        boundary: 'data-fetch',
        resource: 'schedule',
        error_kind: dataError.kind,
        status: dataError.status,
      });
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
      const targetGameId = gameId || loadedGameIdRef.current;
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
          if (isAbortError(result.error)) {
            return;
          }
          const dataError = createDataError('game data', outcome, result);
          transitionGameError(
            result.error || new Error(`Game data fetch failed: ${result.status}`),
            dataError,
          );
          return;
        }

        transitionGameSuccess(result.data, targetGameId);
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
    setGameDataError(null);
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
    gameDataError,
    loadedGameId,
    isBoxLoading,
    isPlayLoading,
    isScheduleLoading,
    scheduleStatus,
    scheduleError,
    fetchGamePack,
    setGameNotStarted,
    fetchSchedule,
    resetLoadingStates,
  };
}
