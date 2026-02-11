import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { useAnalyticsSignals } from './useAnalyticsSignals';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete window.umami;
});

describe('useAnalyticsSignals', () => {
  it('tracks game select, sends heartbeats, and emits one close signal', () => {
    vi.useFakeTimers();

    const track = vi.fn();
    window.umami = { track };

    const { rerender, unmount } = renderHook(
      ({ gameId }) =>
        useAnalyticsSignals({
          gameId,
          date: '2026-02-03',
          currentScheduleGameStatus: 'Q1 08:12',
          isInitLoading: false,
          heartbeatIntervalMs: 1000,
        }),
      {
        initialProps: {
          gameId: '2026-02-03-phi-gsw',
        },
      },
    );

    expect(track).toHaveBeenCalledWith(expect.any(Function));
    expect(track).toHaveBeenCalledWith(
      'heartbeat',
      expect.objectContaining({
        gameId: '2026-02-03-phi-gsw',
        date: '2026-02-03',
        status: 'Q1 08:12',
      }),
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(track).toHaveBeenCalledWith(
      'heartbeat',
      expect.objectContaining({ gameId: '2026-02-03-phi-gsw' }),
    );

    rerender({ gameId: '2026-02-03-phi-gsw' });

    const gameSelectCalls = track.mock.calls.filter((call) => typeof call[0] === 'function').length;
    expect(gameSelectCalls).toBe(1);

    rerender({ gameId: '2026-02-03-lal-bos' });

    const gameSelectCallsAfterChange = track.mock.calls.filter(
      (call) => typeof call[0] === 'function',
    ).length;
    expect(gameSelectCallsAfterChange).toBe(2);

    act(() => {
      const pageHideEvent = new Event('pagehide');
      Object.defineProperty(pageHideEvent, 'persisted', {
        configurable: true,
        value: false,
      });
      window.dispatchEvent(pageHideEvent);
      window.dispatchEvent(new Event('beforeunload'));
    });

    const closeCalls = track.mock.calls.filter((call) => call[0] === 'page-close');
    expect(closeCalls).toHaveLength(1);
    expect(closeCalls[0][1]).toEqual(
      expect.objectContaining({
        reason: 'pagehide',
        gameId: '2026-02-03-lal-bos',
      }),
    );

    const callCountBeforeUnmount = track.mock.calls.length;

    unmount();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(track.mock.calls.length).toBe(callCountBeforeUnmount);
  });
});
