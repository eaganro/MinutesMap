import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWebSocketGate } from './useWebSocketGate';

const mocks = vi.hoisted(() => ({
  nbaToday: '2026-02-03',
}));

vi.mock('../../../domain/game-selection/time', async () => {
  const actual = await vi.importActual('../../../domain/game-selection/time');
  return {
    ...actual,
    getNbaTodayString: () => mocks.nbaToday,
  };
});

describe('useWebSocketGate', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('enables immediately for live games on the current NBA day', async () => {
    const { result } = renderHook(() =>
      useWebSocketGate({
        date: '2026-02-03',
        schedule: [
          {
            id: '2026-02-03-phi-gsw',
            status: 'Q2 05:10',
            starttime: '2026-02-03T20:00:00-05:00',
          },
        ],
        gameId: '2026-02-03-phi-gsw',
        selectedGameDate: '2026-02-03',
        selectedGameStart: new Date('2026-02-04T01:00:00.000Z'),
        selectedGameStatus: 'Q2 05:10',
        selectedGameMetaId: '2026-02-03-phi-gsw',
      }),
    );

    await waitFor(() => {
      expect(result.current.enabled).toBe(true);
    });
    expect(result.current.followDate).toBe(true);
    expect(result.current.followGame).toBe(true);
  });

  it('stays disabled when schedule is final and selected game is final', async () => {
    const { result } = renderHook(() =>
      useWebSocketGate({
        date: '2026-02-03',
        schedule: [
          {
            id: '2026-02-03-phi-gsw',
            status: 'Final',
            starttime: '2026-02-03T20:00:00-05:00',
          },
        ],
        gameId: '2026-02-03-phi-gsw',
        selectedGameDate: '2026-02-03',
        selectedGameStart: new Date('2026-02-04T01:00:00.000Z'),
        selectedGameStatus: 'Final',
        selectedGameMetaId: '2026-02-03-phi-gsw',
      }),
    );

    await waitFor(() => {
      expect(result.current.enabled).toBe(false);
    });
    expect(result.current.followDate).toBe(false);
    expect(result.current.followGame).toBe(false);
  });

  it('waits until tipoff for upcoming games before enabling', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-03T23:20:00.000Z'));

    const { result } = renderHook(() =>
      useWebSocketGate({
        date: '2026-02-03',
        schedule: [
          {
            id: '2026-02-03-phi-gsw',
            status: '7:30 PM ET',
            starttime: '2026-02-03T19:30:00-05:00',
          },
        ],
        gameId: '2026-02-03-phi-gsw',
        selectedGameDate: '2026-02-03',
        selectedGameStart: new Date('2026-02-04T00:30:00.000Z'),
        selectedGameStatus: '7:30 PM ET',
        selectedGameMetaId: '2026-02-03-phi-gsw',
      }),
    );

    expect(result.current.enabled).toBe(false);
    expect(result.current.followDate).toBe(true);
    expect(result.current.followGame).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(80 * 60 * 1000);
      vi.runOnlyPendingTimers();
    });

    expect(result.current.enabled).toBe(true);
  });
});
