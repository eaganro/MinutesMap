import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useStableWhileLoading } from './useStableWhileLoading';

describe('useStableWhileLoading', () => {
  it('returns incoming values while not loading', () => {
    const { result } = renderHook(() =>
      useStableWhileLoading({
        data: { value: 'ready' },
        statusMessage: 'ok',
        isLoading: false,
        isBlurred: false,
      }),
    );

    expect(result.current.displayData).toEqual({ value: 'ready' });
    expect(result.current.displayStatusMessage).toBe('ok');
    expect(result.current.isShowingStableData).toBe(false);
  });

  it('holds previous stable values while loading or blurred', () => {
    const { result, rerender } = renderHook(
      ({ data, statusMessage, isLoading, isBlurred }) =>
        useStableWhileLoading({ data, statusMessage, isLoading, isBlurred }),
      {
        initialProps: {
          data: { value: 'old' },
          statusMessage: 'old-status',
          isLoading: false,
          isBlurred: false,
        },
      },
    );

    rerender({
      data: { value: 'new' },
      statusMessage: 'new-status',
      isLoading: true,
      isBlurred: false,
    });

    expect(result.current.displayData).toEqual({ value: 'old' });
    expect(result.current.displayStatusMessage).toBe('old-status');
    expect(result.current.isShowingStableData).toBe(true);

    rerender({
      data: { value: 'new' },
      statusMessage: 'new-status',
      isLoading: false,
      isBlurred: false,
    });

    expect(result.current.displayData).toEqual({ value: 'new' });
    expect(result.current.displayStatusMessage).toBe('new-status');
    expect(result.current.isShowingStableData).toBe(false);
  });
});
