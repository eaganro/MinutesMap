import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { useGameData } from './useGameData';
import { GAME_NOT_STARTED_MESSAGE } from '../../../domain/game-selection/status';

function createDeferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createResponse(payload, { status = 200, ok = true } = {}) {
  return {
    status,
    ok,
    json: async () => payload,
  };
}

function createGamePack(id) {
  return {
    v: 2,
    id,
    periods: 4,
    last: null,
    actions: [{ actionNumber: Number(id) }],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useGameData', () => {
  it('exposes an offline schedule error and recovers when retried', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(createResponse([{ id: 'retry-game' }]));

    const { result } = renderHook(() => useGameData());

    await act(async () => {
      await result.current.fetchSchedule('2026-02-03');
    });

    expect(result.current.schedule).toEqual([]);
    expect(result.current.scheduleStatus).toBe('error');
    expect(result.current.scheduleError).toEqual(
      expect.objectContaining({ kind: 'network', status: null }),
    );

    await act(async () => {
      await result.current.fetchSchedule('2026-02-03');
    });

    expect(result.current.schedule).toEqual([{ id: 'retry-game' }]);
    expect(result.current.scheduleStatus).toBe('success');
    expect(result.current.scheduleError).toBeNull();
  });

  it('exposes non-404 gamepack HTTP errors without treating the game as not started', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createResponse(null, { status: 500, ok: false }),
    );

    const { result } = renderHook(() => useGameData());

    await act(async () => {
      await result.current.fetchGamePack({ gameId: '2026-02-03-phi-gsw' });
    });

    expect(result.current.gameDataError).toEqual(
      expect.objectContaining({ kind: 'http', status: 500 }),
    );
    expect(result.current.gameStatusMessage).toBeNull();
    expect(result.current.isBoxLoading).toBe(false);
    expect(result.current.isPlayLoading).toBe(false);
  });

  it('retains the loaded game identity and data during a normal game transition', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createResponse(createGamePack('100')));
    const { result } = renderHook(() => useGameData());

    await act(async () => {
      await result.current.fetchGamePack({ gameId: 'previous-game' });
    });

    expect(result.current.loadedGameId).toBe('previous-game');
    expect(result.current.playByPlay.actions).toEqual([{ actionNumber: 100 }]);

    act(() => {
      result.current.resetLoadingStates();
    });

    expect(result.current.loadedGameId).toBe('previous-game');
    expect(result.current.playByPlay.actions).toEqual([{ actionNumber: 100 }]);
    expect(result.current.isPlayLoading).toBe(true);
  });

  it.each([403, 404])(
    'handles gamepack %s responses as not-started and clears game state',
    async (statusCode) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        createResponse(null, { status: statusCode, ok: false }),
      );

      const { result } = renderHook(() => useGameData());

      await act(async () => {
        await result.current.fetchGamePack({ gameId: '2026-02-03-phi-gsw' });
      });

      expect(result.current.gameStatusMessage).toBe(GAME_NOT_STARTED_MESSAGE);
      expect(result.current.box).toEqual({});
      expect(result.current.playByPlay).toEqual([]);
      expect(result.current.awayTeamId).toBeNull();
      expect(result.current.homeTeamId).toBeNull();
      expect(result.current.nbaGameId).toBeNull();
      expect(result.current.lastAction).toBeNull();
      expect(result.current.numPeriods).toBe(4);
      expect(result.current.isBoxLoading).toBe(false);
      expect(result.current.isPlayLoading).toBe(false);
    },
  );

  it('toggles loading flags while a showLoading=true gamepack request is in-flight', async () => {
    const deferred = createDeferred();
    vi.spyOn(globalThis, 'fetch').mockReturnValue(deferred.promise);

    const { result } = renderHook(() => useGameData());

    act(() => {
      result.current.setGameNotStarted();
    });

    expect(result.current.isBoxLoading).toBe(false);
    expect(result.current.isPlayLoading).toBe(false);

    let requestPromise;
    act(() => {
      requestPromise = result.current.fetchGamePack({
        url: '/gamepack/loading',
        showLoading: true,
      });
    });

    expect(result.current.isBoxLoading).toBe(true);
    expect(result.current.isPlayLoading).toBe(true);

    await act(async () => {
      deferred.resolve(
        createResponse({
          v: 2,
          id: '0022500999',
          periods: 4,
          last: null,
          actions: [],
        }),
      );
      await requestPromise;
    });

    expect(result.current.isBoxLoading).toBe(false);
    expect(result.current.isPlayLoading).toBe(false);
  });

  it('keeps loading flags unchanged when showLoading=false', async () => {
    const deferred = createDeferred();
    vi.spyOn(globalThis, 'fetch').mockReturnValue(deferred.promise);

    const { result } = renderHook(() => useGameData());

    act(() => {
      result.current.setGameNotStarted();
    });

    expect(result.current.isBoxLoading).toBe(false);
    expect(result.current.isPlayLoading).toBe(false);

    let requestPromise;
    act(() => {
      requestPromise = result.current.fetchGamePack({
        url: '/gamepack/no-loading',
        showLoading: false,
      });
    });

    expect(result.current.isBoxLoading).toBe(false);
    expect(result.current.isPlayLoading).toBe(false);

    await act(async () => {
      deferred.resolve(
        createResponse({
          v: 2,
          id: '0022501000',
          periods: 4,
          last: null,
          actions: [],
        }),
      );
      await requestPromise;
    });

    expect(result.current.isBoxLoading).toBe(false);
    expect(result.current.isPlayLoading).toBe(false);
  });

  it('ignores a previous date response and keeps loading until the current schedule resolves', async () => {
    const previousDate = createDeferred();
    const currentDate = createDeferred();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockReturnValueOnce(previousDate.promise)
      .mockReturnValueOnce(currentDate.promise);

    const { result } = renderHook(() => useGameData());

    let previousRequest;
    act(() => {
      previousRequest = result.current.fetchSchedule('2026-02-02');
    });

    let currentRequest;
    act(() => {
      currentRequest = result.current.fetchSchedule('2026-02-03');
    });

    expect(fetchSpy.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fetchSpy.mock.calls[1][1].signal.aborted).toBe(false);
    expect(result.current.isScheduleLoading).toBe(true);

    await act(async () => {
      previousDate.resolve(createResponse([{ id: 'previous-game' }]));
      await previousRequest;
    });

    expect(result.current.schedule).toEqual([]);
    expect(result.current.isScheduleLoading).toBe(true);

    await act(async () => {
      currentDate.resolve(createResponse([{ id: 'current-game' }]));
      await currentRequest;
    });

    expect(result.current.schedule).toEqual([{ id: 'current-game' }]);
    expect(result.current.isScheduleLoading).toBe(false);
  });

  it('ignores a previous game response after the selected game request changes', async () => {
    const previousGame = createDeferred();
    const currentGame = createDeferred();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockReturnValueOnce(previousGame.promise)
      .mockReturnValueOnce(currentGame.promise);

    const { result } = renderHook(() => useGameData());

    let previousRequest;
    act(() => {
      previousRequest = result.current.fetchGamePack({ gameId: 'previous-game' });
    });

    let currentRequest;
    act(() => {
      currentRequest = result.current.fetchGamePack({ gameId: 'current-game' });
    });

    expect(fetchSpy.mock.calls[0][1].signal.aborted).toBe(true);
    expect(result.current.isBoxLoading).toBe(true);

    await act(async () => {
      currentGame.resolve(createResponse(createGamePack('200')));
      await currentRequest;
    });

    expect(result.current.nbaGameId).toBe('200');
    expect(result.current.isBoxLoading).toBe(false);

    await act(async () => {
      previousGame.resolve(createResponse(createGamePack('100')));
      await previousRequest;
    });

    expect(result.current.nbaGameId).toBe('200');
    expect(result.current.playByPlay.actions).toEqual([{ actionNumber: 200 }]);
  });

  it('lets the latest background refresh own game state and inherited loading completion', async () => {
    const initialRequest = createDeferred();
    const latestRefresh = createDeferred();
    vi.spyOn(globalThis, 'fetch')
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(latestRefresh.promise);

    const { result } = renderHook(() => useGameData());

    let initialPromise;
    act(() => {
      initialPromise = result.current.fetchGamePack({
        gameId: 'current-game',
        showLoading: true,
      });
    });

    let refreshPromise;
    act(() => {
      refreshPromise = result.current.fetchGamePack({
        url: '/gamepack/current-game?v=2',
        showLoading: false,
      });
    });

    await act(async () => {
      initialRequest.resolve(createResponse(createGamePack('100')));
      await initialPromise;
    });

    expect(result.current.nbaGameId).toBeNull();
    expect(result.current.isBoxLoading).toBe(true);

    await act(async () => {
      latestRefresh.resolve(createResponse(createGamePack('200')));
      await refreshPromise;
    });

    expect(result.current.nbaGameId).toBe('200');
    expect(result.current.isBoxLoading).toBe(false);
    expect(result.current.isPlayLoading).toBe(false);
  });

  it('invalidates an in-flight game response when the selected game resets', async () => {
    const deferred = createDeferred();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(deferred.promise);
    const { result } = renderHook(() => useGameData());

    let requestPromise;
    act(() => {
      requestPromise = result.current.fetchGamePack({ gameId: 'previous-game' });
    });

    act(() => {
      result.current.resetLoadingStates();
    });

    expect(fetchSpy.mock.calls[0][1].signal.aborted).toBe(true);

    await act(async () => {
      deferred.resolve(createResponse(createGamePack('100')));
      await requestPromise;
    });

    expect(result.current.nbaGameId).toBeNull();
    expect(result.current.isBoxLoading).toBe(true);
    expect(result.current.isPlayLoading).toBe(true);
  });

  it('does not log an aborted stale request as a failure', async () => {
    const currentRequest = createDeferred();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy
      .mockImplementationOnce((_url, { signal }) => {
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });
      })
      .mockReturnValueOnce(currentRequest.promise);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useGameData());

    let abortedPromise;
    act(() => {
      abortedPromise = result.current.fetchGamePack({ gameId: 'previous-game' });
    });

    let currentPromise;
    act(() => {
      currentPromise = result.current.fetchGamePack({ gameId: 'current-game' });
    });

    await act(async () => {
      currentRequest.resolve(createResponse(createGamePack('200')));
      await Promise.all([abortedPromise, currentPromise]);
    });

    expect(errorSpy).not.toHaveBeenCalled();
    expect(result.current.nbaGameId).toBe('200');
  });

  it('handles v2, schemaVersion=1, and combined gamepack payload shapes', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        createResponse({
          v: 2,
          id: 22500001,
          periods: 5,
          last: {
            quarter: 5,
            time: 'PT01M02.00S',
            awayScore: 120,
            homeScore: 118,
          },
          actions: [{ actionNumber: 501 }],
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          schemaVersion: 1,
          id: '0022500002',
          numPeriods: 3,
          lastAction: {
            period: 3,
            clock: 'PT00M20.00S',
            scoreAway: 79,
            scoreHome: 81,
          },
          actions: [{ actionNumber: 601 }],
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          nbaGameId: '0022500003',
          box: {
            id: '0022500003',
            teams: {
              away: { id: 10, name: 'Away Team', abbr: 'AWY' },
              home: { id: 20, name: 'Home Team', abbr: 'HME' },
            },
          },
          flow: {
            v: 2,
            periods: 4,
            last: {
              quarter: 2,
              time: 'PT07M00.00S',
              awayScore: 50,
              homeScore: 47,
            },
            actions: [{ actionNumber: 701 }],
          },
        }),
      );

    const { result } = renderHook(() => useGameData());

    act(() => {
      result.current.setGameNotStarted();
    });

    await act(async () => {
      await result.current.fetchGamePack({ url: '/gamepack/v2', showLoading: false });
    });

    expect(result.current.nbaGameId).toBe('22500001');
    expect(result.current.numPeriods).toBe(5);
    expect(result.current.lastAction).toEqual({
      period: 5,
      clock: 'PT01M02.00S',
      scoreAway: 120,
      scoreHome: 118,
    });
    expect(result.current.playByPlay).toEqual(
      expect.objectContaining({
        v: 2,
        actions: [{ actionNumber: 501 }],
      }),
    );

    await act(async () => {
      await result.current.fetchGamePack({ url: '/gamepack/schema-v1', showLoading: false });
    });

    expect(result.current.nbaGameId).toBe('0022500002');
    expect(result.current.numPeriods).toBe(3);
    expect(result.current.lastAction).toEqual({
      period: 3,
      clock: 'PT00M20.00S',
      scoreAway: 79,
      scoreHome: 81,
    });
    expect(result.current.playByPlay).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        actions: [{ actionNumber: 601 }],
      }),
    );

    await act(async () => {
      await result.current.fetchGamePack({ url: '/gamepack/combined', showLoading: false });
    });

    expect(result.current.nbaGameId).toBe('0022500003');
    expect(result.current.box).toEqual(
      expect.objectContaining({
        teams: {
          away: expect.objectContaining({ id: 10, abbr: 'AWY' }),
          home: expect.objectContaining({ id: 20, abbr: 'HME' }),
        },
      }),
    );
    expect(result.current.awayTeamId).toBe(10);
    expect(result.current.homeTeamId).toBe(20);
    expect(result.current.numPeriods).toBe(4);
    expect(result.current.lastAction).toEqual({
      period: 2,
      clock: 'PT07M00.00S',
      scoreAway: 50,
      scoreHome: 47,
    });
    expect(result.current.playByPlay).toEqual(
      expect.objectContaining({
        v: 2,
        actions: [{ actionNumber: 701 }],
      }),
    );
  });
});
