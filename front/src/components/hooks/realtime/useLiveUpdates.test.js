import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useLiveUpdates } from './useLiveUpdates';

const mocks = vi.hoisted(() => ({
  useSelectedGameMetaMock: vi.fn(),
  useWebSocketGateMock: vi.fn(),
  useWebSocketMock: vi.fn(),
}));

vi.mock('../schedule/useSelectedGameMeta', () => ({
  useSelectedGameMeta: mocks.useSelectedGameMetaMock,
}));

vi.mock('./useWebSocketGate', () => ({
  useWebSocketGate: mocks.useWebSocketGateMock,
}));

vi.mock('./useWebSocket', () => ({
  useWebSocket: mocks.useWebSocketMock,
}));

describe('useLiveUpdates', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useSelectedGameMetaMock.mockReturnValue({
      selectedGameDate: '2026-02-03',
      selectedGameStart: new Date('2026-02-03T00:00:00Z'),
      selectedGameStatus: 'Q3 05:00',
      selectedGameMetaId: '2026-02-03-phi-gsw',
    });

    mocks.useWebSocketGateMock.mockReturnValue({
      enabled: true,
      followDate: true,
      followGame: true,
    });

    mocks.useWebSocketMock.mockReturnValue({
      ws: { readyState: 1 },
    });
  });

  it('wires websocket gate/meta and routes ws callbacks to fetch wrappers', () => {
    const fetchGamePackWithReason = vi.fn();
    const fetchScheduleWithReason = vi.fn();

    const schedule = [{ id: '2026-02-03-phi-gsw', status: 'Q3 05:00' }];

    const { result } = renderHook(() =>
      useLiveUpdates({
        gameId: '2026-02-03-phi-gsw',
        date: '2026-02-03',
        schedule,
        fetchGamePackWithReason,
        fetchScheduleWithReason,
      }),
    );

    expect(result.current.ws).toEqual({ readyState: 1 });

    expect(mocks.useWebSocketGateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: '2026-02-03-phi-gsw',
        date: '2026-02-03',
        schedule,
        selectedGameMetaId: '2026-02-03-phi-gsw',
      }),
    );

    const wsArgs = mocks.useWebSocketMock.mock.calls[0][0];

    const key = 'data/gamepack/2026-02-03-phi-gsw.json.gz';
    act(() => {
      wsArgs.onPlayByPlayUpdate(key, 42);
    });

    expect(fetchGamePackWithReason).toHaveBeenCalledWith(
      expect.objectContaining({
        showLoading: false,
        url: expect.stringContaining(encodeURIComponent(key)),
      }),
      'ws',
    );

    act(() => {
      wsArgs.onDateUpdate('2026-02-02');
    });
    expect(fetchScheduleWithReason).not.toHaveBeenCalled();

    act(() => {
      wsArgs.onDateUpdate('2026-02-03');
    });
    expect(fetchScheduleWithReason).toHaveBeenCalledWith('2026-02-03', 'ws');
  });
});
