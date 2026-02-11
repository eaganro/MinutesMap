import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { useScheduleState } from './useScheduleState';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useScheduleState', () => {
  it('bootstraps date from init.json and triggers schedule fetch with reason', async () => {
    const setGameId = vi.fn();
    const fetchScheduleWithReason = vi.fn();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        date: '2026-02-03',
        autoSelectGameId: '2026-02-03-phi-gsw',
      }),
    });

    const { result } = renderHook(() =>
      useScheduleState({
        initialDate: null,
        initialGameId: null,
        gameId: null,
        setGameId,
        schedule: [],
        isScheduleLoading: false,
        fetchScheduleWithReason,
      }),
    );

    await waitFor(() => {
      expect(result.current.date).toBe('2026-02-03');
      expect(result.current.isInitLoading).toBe(false);
    });

    expect(setGameId).toHaveBeenCalledWith('2026-02-03-phi-gsw');
    expect(fetchScheduleWithReason).toHaveBeenCalledWith('2026-02-03', 'date-change');
  });

  it('auto-selects the top sorted game once schedule is ready and no game is selected', () => {
    const setGameId = vi.fn();

    renderHook(() =>
      useScheduleState({
        initialDate: '2026-02-03',
        initialGameId: null,
        gameId: null,
        setGameId,
        schedule: [
          {
            id: '2026-02-03-lal-bos',
            status: 'Q1 11:00',
            starttime: '2026-02-03T20:00:00',
          },
          {
            id: '2026-02-03-phi-gsw',
            status: 'Final',
            starttime: '2026-02-03T18:00:00',
          },
        ],
        isScheduleLoading: false,
        fetchScheduleWithReason: vi.fn(),
      }),
    );

    expect(setGameId).toHaveBeenCalledWith('2026-02-03-lal-bos');
  });

  it('exposes a value-based changeDate API', () => {
    const { result } = renderHook(() =>
      useScheduleState({
        initialDate: '2026-02-03',
        initialGameId: null,
        gameId: '2026-02-03-lal-bos',
        setGameId: vi.fn(),
        schedule: [],
        isScheduleLoading: false,
        fetchScheduleWithReason: vi.fn(),
      }),
    );

    act(() => {
      result.current.changeDate('2026-02-05');
    });

    expect(result.current.date).toBe('2026-02-05');
  });

  it('falls back to today when init payload date is invalid', async () => {
    const setGameId = vi.fn();
    const fetchScheduleWithReason = vi.fn();
    const today = new Date().toISOString().split('T')[0];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        date: '02/11/2026',
        autoSelectGameId: '',
      }),
    });

    const { result } = renderHook(() =>
      useScheduleState({
        initialDate: null,
        initialGameId: null,
        gameId: null,
        setGameId,
        schedule: [],
        isScheduleLoading: false,
        fetchScheduleWithReason,
      }),
    );

    await waitFor(() => {
      expect(result.current.date).toBe(today);
      expect(result.current.isInitLoading).toBe(false);
    });

    expect(setGameId).not.toHaveBeenCalled();
    expect(fetchScheduleWithReason).toHaveBeenCalledWith(today, 'date-change');
  });
});
