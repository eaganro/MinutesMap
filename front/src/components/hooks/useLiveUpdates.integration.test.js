import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getNbaTodayString, shiftDateString } from '../../domain/game-selection/time';
import { useLiveUpdates } from './useLiveUpdates';

const mocks = vi.hoisted(() => ({
  useWebSocketMock: vi.fn(),
}));

vi.mock('./useWebSocket', () => ({
  useWebSocket: mocks.useWebSocketMock,
}));

describe('useLiveUpdates seam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWebSocketMock.mockReturnValue({ ws: { readyState: 1 } });
  });

  it('wires selected-meta + ws gate into websocket args and callback contract', async () => {
    const date = getNbaTodayString();
    const schedule = [
      {
        id: `${date}-phi-gsw`,
        status: 'Q3 04:11',
        starttime: `${date}T20:00:00`,
      },
    ];
    const fetchGamePackWithReason = vi.fn();
    const fetchScheduleWithReason = vi.fn();

    renderHook(() =>
      useLiveUpdates({
        gameId: `${date}-phi-gsw`,
        date,
        schedule,
        fetchGamePackWithReason,
        fetchScheduleWithReason,
      }),
    );

    await waitFor(() => {
      const latestArgs = mocks.useWebSocketMock.mock.calls.at(-1)?.[0];
      expect(latestArgs.enabled).toBe(true);
      expect(latestArgs.followDate).toBe(true);
      expect(latestArgs.followGame).toBe(true);
    });

    const wsArgs = mocks.useWebSocketMock.mock.calls.at(-1)[0];

    act(() => {
      wsArgs.onPlayByPlayUpdate('data/gamepack/live.json.gz', 7);
    });
    expect(fetchGamePackWithReason).toHaveBeenCalledWith(
      expect.objectContaining({
        showLoading: false,
        url: expect.stringContaining(encodeURIComponent('data/gamepack/live.json.gz')),
      }),
      'ws',
    );

    act(() => {
      wsArgs.onDateUpdate(date);
    });
    expect(fetchScheduleWithReason).toHaveBeenCalledWith(date, 'ws');
  });

  it('disables websocket when selected game is on a non-current NBA day', async () => {
    const date = shiftDateString(getNbaTodayString(), -1);
    const schedule = [
      {
        id: `${date}-phi-gsw`,
        status: 'Q1 11:00',
        starttime: `${date}T20:00:00`,
      },
    ];

    renderHook(() =>
      useLiveUpdates({
        gameId: `${date}-phi-gsw`,
        date,
        schedule,
        fetchGamePackWithReason: vi.fn(),
        fetchScheduleWithReason: vi.fn(),
      }),
    );

    await waitFor(() => {
      const latestArgs = mocks.useWebSocketMock.mock.calls.at(-1)?.[0];
      expect(latestArgs.enabled).toBe(false);
      expect(latestArgs.followDate).toBe(false);
      expect(latestArgs.followGame).toBe(false);
    });
  });
});
