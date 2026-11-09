import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMinimumLoadingState } from './useMinimumLoadingState';

describe('useMinimumLoadingState', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('ends the first load as soon as it finishes, with nothing on screen to protect', () => {
    const { result, rerender } = renderHook(
      ({ isLoading }) => useMinimumLoadingState(isLoading, 300, { skipFirstLoad: true }),
      {
        initialProps: { isLoading: true },
      },
    );
    expect(result.current).toBe(true);

    act(() => vi.advanceTimersByTime(50));
    rerender({ isLoading: false });
    expect(result.current).toBe(false);
  });

  it('keeps later loads visible for the minimum time', () => {
    const { result, rerender } = renderHook(
      ({ isLoading }) => useMinimumLoadingState(isLoading, 300, { skipFirstLoad: true }),
      {
        initialProps: { isLoading: true },
      },
    );
    rerender({ isLoading: false });

    rerender({ isLoading: true });
    act(() => vi.advanceTimersByTime(50));
    rerender({ isLoading: false });
    expect(result.current).toBe(true);

    act(() => vi.advanceTimersByTime(250));
    expect(result.current).toBe(false);
  });

  it('keeps every load visible for the minimum time by default', () => {
    const { result, rerender } = renderHook(
      ({ isLoading }) => useMinimumLoadingState(isLoading, 300),
      { initialProps: { isLoading: true } },
    );
    act(() => vi.advanceTimersByTime(50));
    rerender({ isLoading: false });
    expect(result.current).toBe(true);

    act(() => vi.advanceTimersByTime(250));
    expect(result.current).toBe(false);
  });

  it('treats a load that starts after mount as the first one', () => {
    const { result, rerender } = renderHook(
      ({ isLoading }) => useMinimumLoadingState(isLoading, 300, { skipFirstLoad: true }),
      {
        initialProps: { isLoading: false },
      },
    );
    expect(result.current).toBe(false);

    rerender({ isLoading: true });
    rerender({ isLoading: false });
    expect(result.current).toBe(false);
  });
});
