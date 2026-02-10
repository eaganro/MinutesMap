import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { toDateInputValue, useDateInputState } from './useDateInputState';

describe('useDateInputState', () => {
  it('normalizes common date-like values', () => {
    expect(toDateInputValue('2026-02-03')).toBe('2026-02-03');
    expect(toDateInputValue('2026-02-03T20:00:00')).toBe('2026-02-03');
    expect(toDateInputValue('not-a-date')).toBe('');
  });

  it('changes and shifts date values with plain YYYY-MM-DD strings', () => {
    const onDateChange = vi.fn();
    const onDateInteract = vi.fn();

    const { result } = renderHook(() =>
      useDateInputState({
        date: '2026-02-03',
        onDateChange,
        onDateInteract,
      }),
    );

    act(() => {
      result.current.handleDateChange('2026-02-04');
    });
    act(() => {
      result.current.shiftDate(2);
    });

    expect(onDateInteract).toHaveBeenCalledTimes(2);
    expect(onDateChange).toHaveBeenNthCalledWith(1, '2026-02-04');
    expect(onDateChange).toHaveBeenNthCalledWith(2, '2026-02-05');
  });
});
