import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { getNbaTodayString } from '../../domain/game-selection/time';
import { useResumeRefresh } from './useResumeRefresh';

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
});

describe('useResumeRefresh', () => {
  it('respects ws cooldown thresholds and refreshes on resume events', () => {
    const fetchGamePackWithReason = vi.fn();
    const fetchScheduleWithReason = vi.fn();
    const date = getNbaTodayString();
    const baseNow = 1_700_000_000_000;

    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(baseNow + 59_000);

    const lastGamePackFetchRef = {
      current: {
        at: baseNow,
        reason: 'ws',
      },
    };
    const lastScheduleFetchRef = {
      current: {
        at: baseNow,
        reason: 'ws',
      },
    };

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });

    const { unmount } = renderHook(() =>
      useResumeRefresh({
        date,
        gameId: '2026-02-03-phi-gsw',
        isSelectedGameFinal: false,
        isWebSocketOpen: true,
        fetchGamePackWithReason,
        fetchScheduleWithReason,
        lastGamePackFetchRef,
        lastScheduleFetchRef,
      }),
    );

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(fetchGamePackWithReason).not.toHaveBeenCalled();
    expect(fetchScheduleWithReason).not.toHaveBeenCalled();

    nowSpy.mockReturnValue(baseNow + 61_000);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(fetchGamePackWithReason).toHaveBeenCalledWith(
      {
        gameId: '2026-02-03-phi-gsw',
        showLoading: false,
      },
      'resume',
    );
    expect(fetchScheduleWithReason).toHaveBeenCalledWith(date, 'resume');

    const gamePackCallsBeforeUnmount = fetchGamePackWithReason.mock.calls.length;
    const scheduleCallsBeforeUnmount = fetchScheduleWithReason.mock.calls.length;

    unmount();

    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });

    expect(fetchGamePackWithReason).toHaveBeenCalledTimes(gamePackCallsBeforeUnmount);
    expect(fetchScheduleWithReason).toHaveBeenCalledTimes(scheduleCallsBeforeUnmount);
  });

  it('skips resume refresh when document is not visible', () => {
    const fetchGamePackWithReason = vi.fn();
    const fetchScheduleWithReason = vi.fn();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });

    renderHook(() =>
      useResumeRefresh({
        date: getNbaTodayString(),
        gameId: '2026-02-03-phi-gsw',
        isSelectedGameFinal: false,
        isWebSocketOpen: false,
        fetchGamePackWithReason,
        fetchScheduleWithReason,
        lastGamePackFetchRef: { current: { at: 0, reason: null } },
        lastScheduleFetchRef: { current: { at: 0, reason: null } },
      }),
    );

    act(() => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('pageshow'));
    });

    expect(fetchGamePackWithReason).not.toHaveBeenCalled();
    expect(fetchScheduleWithReason).not.toHaveBeenCalled();
  });
});
