import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePlayInteraction } from './usePlayInteraction';

const allActions = [
  {
    actionNumber: 1,
    period: 1,
    clock: 'PT11M00.00S',
    actionType: 'rebound',
    description: 'Defensive rebound',
  },
  {
    actionNumber: 2,
    period: 1,
    clock: 'PT11M00.00S',
    actionType: 'assist',
    description: 'Assist',
  },
  {
    actionNumber: 3,
    period: 1,
    clock: 'PT10M00.00S',
    actionType: '2pt',
    result: 'm',
    description: 'Jump shot made',
  },
];

const oddsTimeline = [
  {
    period: 1,
    clock: 'PT11M30.00S',
    awayWinProb: 0.54,
  },
  {
    period: 1,
    clock: 'PT10M00.00S',
    awayWinProb: 0.67,
  },
];

const buildHook = () =>
  renderHook(() => {
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 600,
      bottom: 300,
      width: 600,
      height: 300,
    });
    return usePlayInteraction({
      allActions,
      oddsTimeline,
      leftMargin: 96,
      timelineWidth: 500,
      timelineWindow: {
        startSeconds: 0,
        durationSeconds: 2880,
      },
      playRef: { current: container },
    });
  });

describe('usePlayInteraction', () => {
  it('navigates across distinct timestamps and keeps grouped same-time actions together', () => {
    const { result } = buildHook();

    act(() => {
      result.current.setHighlightActionIds([1]);
      result.current.setDescriptionArray([allActions[0]]);
    });

    expect(result.current.hasPrevAction).toBe(false);
    expect(result.current.hasNextAction).toBe(true);

    act(() => {
      const moved = result.current.navigateAction(1);
      expect(moved).toBe(true);
    });

    expect(result.current.highlightActionIds).toEqual([3]);
    expect(result.current.descriptionArray.map((entry) => entry.actionNumber)).toEqual([3]);

    act(() => {
      const movedBack = result.current.navigateAction(-1);
      expect(movedBack).toBe(true);
    });

    expect(result.current.highlightActionIds).toEqual([1, 2]);
    expect(result.current.descriptionArray.map((entry) => entry.actionNumber)).toEqual([1, 2]);
  });

  it('respects resetInteraction force flag while info is locked', () => {
    const { result } = buildHook();

    act(() => {
      result.current.setInfoLocked(true);
      result.current.setMouseLinePos(200);
      result.current.setDescriptionArray([allActions[0]]);
      result.current.setHighlightActionIds([1]);
    });

    act(() => {
      result.current.resetInteraction();
    });
    expect(result.current.descriptionArray).toHaveLength(1);
    expect(result.current.highlightActionIds).toEqual([1]);

    act(() => {
      result.current.resetInteraction(true);
    });
    expect(result.current.descriptionArray).toEqual([]);
    expect(result.current.highlightActionIds).toEqual([]);
    expect(result.current.mouseLinePos).toBeNull();
  });

  it('selects the closest grouped timestamp on hover fallback when no marker is targeted', () => {
    const { result } = buildHook();
    const target = document.createElement('div');

    act(() => {
      result.current.updateHoverAt(108, 90, target);
    });

    expect(result.current.highlightActionIds).toEqual([1, 2]);
    expect(result.current.descriptionArray.map((entry) => entry.actionNumber)).toEqual([1, 2]);
    expect([1, 2]).toContain(result.current.focusActionMeta?.actionNumber);
    expect(result.current.focusActionMeta?.awayWinProb).toBe(0.54);
  });

  it('supports keyboard navigation while info is locked', () => {
    const { result } = buildHook();

    act(() => {
      result.current.setInfoLocked(true);
      result.current.setHighlightActionIds([1]);
      result.current.setDescriptionArray([allActions[0]]);
    });

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    });

    expect(result.current.highlightActionIds).toEqual([3]);

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(result.current.infoLocked).toBe(false);
    expect(result.current.descriptionArray).toEqual([]);
  });

  it('tracks the latest known win odds for the selected action timestamp', () => {
    const { result } = buildHook();

    act(() => {
      result.current.setHighlightActionIds([1]);
      result.current.setDescriptionArray([allActions[0]]);
    });

    act(() => {
      result.current.navigateAction(1);
    });

    expect(result.current.focusActionMeta).toEqual({
      actionNumber: 3,
      awayWinProb: 0.67,
    });
  });
});
