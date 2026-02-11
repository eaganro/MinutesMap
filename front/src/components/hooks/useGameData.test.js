import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { useGameData } from './useGameData';
import { GAME_NOT_STARTED_MESSAGE } from '../../domain/game-selection/status';

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useGameData', () => {
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
