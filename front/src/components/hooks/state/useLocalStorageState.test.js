import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isBooleanPreference } from './storage';
import { useLocalStorageState } from './useLocalStorageState';

describe('useLocalStorageState', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('falls back from invalid data and persists subsequent updates', async () => {
    localStorage.setItem('preference', JSON.stringify({ enabled: true }));

    const { result } = renderHook(() =>
      useLocalStorageState('preference', false, { validate: isBooleanPreference }),
    );

    expect(result.current[0]).toBe(false);
    await waitFor(() => expect(localStorage.getItem('preference')).toBe('false'));

    act(() => result.current[1](true));
    await waitFor(() => expect(localStorage.getItem('preference')).toBe('true'));
  });

  it('still renders and updates state when reads and writes fail', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError');
    });

    const { result } = renderHook(() =>
      useLocalStorageState('preference', false, { validate: isBooleanPreference }),
    );

    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
  });
});
