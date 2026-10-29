import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAY_TIP_SHOW_DELAY_MS, PLAY_TIPS_STORAGE_KEY, usePlayTips } from './usePlayTips';

const baseProps = {
  enabled: true,
  canSelectPlayers: true,
  hasOpenTooltip: false,
  isPlayerDetailOpen: false,
  statsSignature: 'initial',
};

const renderTips = (props = {}) => {
  const playRef = { current: document.createElement('div') };
  return renderHook((hookProps) => usePlayTips({ playRef, ...hookProps }), {
    initialProps: { ...baseProps, ...props },
  });
};

const showTips = () => {
  act(() => {
    vi.advanceTimersByTime(PLAY_TIP_SHOW_DELAY_MS);
  });
};

const storedProgress = () => JSON.parse(localStorage.getItem(PLAY_TIPS_STORAGE_KEY));

describe('usePlayTips', () => {
  let capture;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    capture = vi.fn();
    window.posthog = { capture };
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.posthog;
  });

  it('shows the first tip after the chart has been on screen briefly', () => {
    const { result } = renderTips();

    expect(result.current.activeTip).toBeNull();
    showTips();

    expect(result.current.activeTip).toBe('lines');
    expect(capture).toHaveBeenCalledWith('play-tip', { tip: 'lines', outcome: 'shown' });
  });

  it('does not show tips while the chart is unavailable', () => {
    const { result } = renderTips({ enabled: false });
    showTips();

    expect(result.current.activeTip).toBeNull();
  });

  it('moves to the next tip when one is dismissed and remembers it', () => {
    const { result } = renderTips();
    showTips();

    act(() => result.current.dismissTip('lines'));

    expect(result.current.activeTip).toBe('explore');
    expect(storedProgress()).toEqual({ lines: true });
    expect(capture).toHaveBeenCalledWith('play-tip', {
      tip: 'lines',
      outcome: 'dismissed',
      wasShown: true,
    });
  });

  it('completes the explore tip when the play tooltip opens, even before it is shown', () => {
    const { result, rerender } = renderTips();
    showTips();

    rerender({ ...baseProps, hasOpenTooltip: true });

    expect(storedProgress()).toEqual({ explore: true });
    expect(capture).toHaveBeenCalledWith('play-tip', {
      tip: 'explore',
      outcome: 'completed',
      wasShown: false,
    });
    expect(result.current.activeTip).toBe('lines');
  });

  it('holds the player tip until the play tooltip closes', () => {
    localStorage.setItem(PLAY_TIPS_STORAGE_KEY, JSON.stringify({ lines: true, explore: true }));
    const { result, rerender } = renderTips({ hasOpenTooltip: true });
    showTips();

    expect(result.current.activeTip).toBeNull();

    rerender({ ...baseProps, hasOpenTooltip: false });
    expect(result.current.activeTip).toBe('player');
  });

  it('goes straight from the lines tip to the stats tip with a mouse', () => {
    const { result } = renderTips({ canHover: true, canSelectPlayers: false });
    showTips();

    act(() => result.current.dismissTip('lines'));

    expect(result.current.activeTip).toBe('stats');
  });

  it('skips the player tip where player names do not open a detail view', () => {
    localStorage.setItem(PLAY_TIPS_STORAGE_KEY, JSON.stringify({ lines: true, explore: true }));
    const { result } = renderTips({ canSelectPlayers: false });
    showTips();

    expect(result.current.activeTip).toBe('stats');
  });

  it('completes the stats tip when the stat legend changes and then shows nothing more', () => {
    localStorage.setItem(
      PLAY_TIPS_STORAGE_KEY,
      JSON.stringify({ lines: true, explore: true, player: true }),
    );
    const { result, rerender } = renderTips();
    showTips();
    expect(result.current.activeTip).toBe('stats');

    rerender({ ...baseProps, statsSignature: 'changed' });

    expect(result.current.activeTip).toBeNull();
    expect(capture).toHaveBeenCalledWith('play-tip', {
      tip: 'stats',
      outcome: 'completed',
      wasShown: true,
    });
  });

  it('completes the player tip when a player detail view opens', () => {
    localStorage.setItem(PLAY_TIPS_STORAGE_KEY, JSON.stringify({ lines: true, explore: true }));
    const { result, rerender } = renderTips();
    showTips();
    expect(result.current.activeTip).toBe('player');

    rerender({ ...baseProps, enabled: false, isPlayerDetailOpen: true });

    expect(storedProgress()).toEqual({ lines: true, explore: true, player: true });
  });

  it('hides every tip once skipped', () => {
    const { result } = renderTips();
    showTips();

    act(() => result.current.skipTips());

    expect(result.current.activeTip).toBeNull();
    expect(storedProgress()).toEqual({ skipped: true });
    expect(capture).toHaveBeenCalledWith('play-tip', { tip: 'lines', outcome: 'skipped' });
  });
});
