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

const buildHook = () =>
  renderHook(() =>
    usePlayInteraction({
      allActions,
      leftMargin: 96,
      timelineWidth: 500,
      timelineWindow: {
        startSeconds: 0,
        durationSeconds: 2880,
      },
      playRef: { current: document.createElement('div') },
    }),
  );

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
});
