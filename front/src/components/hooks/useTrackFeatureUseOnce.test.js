import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useTrackFeatureUseOnce } from './useTrackFeatureUseOnce';

const mocks = vi.hoisted(() => ({
  trackFeatureUseMock: vi.fn(),
}));

vi.mock('../../helpers/analytics', () => ({
  trackFeatureUse: mocks.trackFeatureUseMock,
}));

describe('useTrackFeatureUseOnce', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tracks only on first invocation', () => {
    const { result } = renderHook(() => useTrackFeatureUseOnce('boxscore'));

    expect(result.current()).toBe(true);
    expect(result.current()).toBe(false);

    expect(mocks.trackFeatureUseMock).toHaveBeenCalledTimes(1);
    expect(mocks.trackFeatureUseMock).toHaveBeenCalledWith('boxscore', undefined);
  });

  it('uses explicit payload when provided', () => {
    const { result } = renderHook(() => useTrackFeatureUseOnce('lineups', { source: 'tap' }));

    result.current();

    expect(mocks.trackFeatureUseMock).toHaveBeenCalledWith('lineups', { source: 'tap' });
  });
});
