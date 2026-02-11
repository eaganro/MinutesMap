import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useGamePackSync } from './useGamePackSync';

describe('useGamePackSync', () => {
  it('dedupes gamepack fetches and sets reasons across game transitions', () => {
    const fetchGamePack = vi.fn();
    const fetchSchedule = vi.fn();
    const setGameNotStarted = vi.fn();

    const { result, rerender } = renderHook(
      ({ gameId, selectedScheduleGame, isSelectedGameUpcoming, isScheduleLoading }) =>
        useGamePackSync({
          date: '2026-02-03',
          gameId,
          selectedScheduleGame,
          isSelectedGameUpcoming,
          isScheduleLoading,
          fetchGamePack,
          fetchSchedule,
          setGameNotStarted,
        }),
      {
        initialProps: {
          gameId: '2026-02-03-phi-gsw',
          selectedScheduleGame: null,
          isSelectedGameUpcoming: false,
          isScheduleLoading: false,
        },
      },
    );

    expect(fetchGamePack).toHaveBeenCalledTimes(1);
    expect(fetchGamePack).toHaveBeenLastCalledWith({
      gameId: '2026-02-03-phi-gsw',
      showLoading: true,
    });
    expect(result.current.lastGamePackFetchRef.current.reason).toBe('initial');

    rerender({
      gameId: '2026-02-03-phi-gsw',
      selectedScheduleGame: null,
      isSelectedGameUpcoming: false,
      isScheduleLoading: false,
    });
    expect(fetchGamePack).toHaveBeenCalledTimes(1);

    rerender({
      gameId: '2026-02-03-lal-bos',
      selectedScheduleGame: null,
      isSelectedGameUpcoming: false,
      isScheduleLoading: false,
    });
    expect(fetchGamePack).toHaveBeenCalledTimes(2);
    expect(fetchGamePack).toHaveBeenLastCalledWith({
      gameId: '2026-02-03-lal-bos',
      showLoading: true,
    });
    expect(result.current.lastGamePackFetchRef.current.reason).toBe('game-change');

    rerender({
      gameId: '2026-02-03-nyk-mia',
      selectedScheduleGame: { id: '2026-02-03-nyk-mia', status: '7:00 PM ET' },
      isSelectedGameUpcoming: true,
      isScheduleLoading: false,
    });
    expect(setGameNotStarted).toHaveBeenCalledTimes(1);
    expect(fetchGamePack).toHaveBeenCalledTimes(2);

    rerender({
      gameId: '2026-02-03-nyk-mia',
      selectedScheduleGame: { id: '2026-02-03-nyk-mia', status: '7:00 PM ET' },
      isSelectedGameUpcoming: true,
      isScheduleLoading: false,
    });
    expect(setGameNotStarted).toHaveBeenCalledTimes(1);
  });

  it('waits for schedule match before fetching and tracks schedule fetch reasons', () => {
    const fetchGamePack = vi.fn();
    const fetchSchedule = vi.fn();
    const setGameNotStarted = vi.fn();

    const { result, rerender } = renderHook(
      ({ isScheduleLoading, selectedScheduleGame }) =>
        useGamePackSync({
          date: '2026-02-03',
          gameId: '2026-02-03-phi-gsw',
          selectedScheduleGame,
          isSelectedGameUpcoming: false,
          isScheduleLoading,
          fetchGamePack,
          fetchSchedule,
          setGameNotStarted,
        }),
      {
        initialProps: {
          isScheduleLoading: true,
          selectedScheduleGame: null,
        },
      },
    );

    expect(fetchGamePack).not.toHaveBeenCalled();

    rerender({
      isScheduleLoading: false,
      selectedScheduleGame: null,
    });

    expect(fetchGamePack).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.fetchScheduleWithReason('2026-02-03', 'ws');
    });

    expect(fetchSchedule).toHaveBeenCalledWith('2026-02-03');
    expect(result.current.lastScheduleFetchRef.current.reason).toBe('ws');
  });
});
