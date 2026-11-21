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
  it('never stays pinned with nothing to show, which would block hovering', () => {
    const { result } = buildHook();
    act(() => {
      result.current.setInfoLocked(true);
    });
    expect(result.current.infoLocked).toBe(false);
  });

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

describe('usePlayInteraction with a highlighted player', () => {
  const at = (actionNumber, minutesLeft, extra = {}) => ({
    actionNumber,
    period: 1,
    clock: `PT${String(minutesLeft).padStart(2, '0')}M00.00S`,
    actionType: 'rebound',
    description: `Action ${actionNumber}`,
    ...extra,
  });
  const gameActions = [at(1, 11), at(2, 10), at(3, 10), at(4, 9), at(5, 8)];
  // Their events: #3 (shares 10:00 with #2) and #5.
  const theirActions = [gameActions[2], gameActions[4]];
  const container = document.createElement('div');
  container.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 300 });

  const buildFocusedHook = () =>
    renderHook(() =>
      usePlayInteraction({
        allActions: gameActions,
        focusActions: theirActions,
        oddsTimeline: [],
        leftMargin: 0,
        // One pixel a second over the first period.
        timelineWidth: 720,
        timelineWindow: { startSeconds: 0, durationSeconds: 720 },
        playRef: { current: container },
      }),
    );

  it('steps Previous/Next through their events only, from any moment', () => {
    const { result } = buildFocusedHook();
    act(() => {
      result.current.setDescriptionArray([gameActions[0]]);
    });
    expect(result.current.hasPrevAction).toBe(false);

    act(() => {
      result.current.navigateAction(1);
    });
    // Their event, shown with everything else at that moment.
    expect(result.current.descriptionArray.map((action) => action.actionNumber)).toEqual([2, 3]);

    act(() => {
      result.current.navigateAction(1);
    });
    expect(result.current.descriptionArray.map((action) => action.actionNumber)).toEqual([5]);
    expect(result.current.hasNextAction).toBe(false);

    act(() => {
      result.current.navigateAction(-1);
    });
    expect(result.current.descriptionArray.map((action) => action.actionNumber)).toEqual([2, 3]);
  });

  it('snaps hovering to their nearest event either side of the cursor', () => {
    const { result } = buildFocusedHook();
    // Their events are at 10:00 (120s in) and 8:00 (240s in).
    act(() => {
      result.current.updateHoverAt(150, 10, null);
    });
    expect(result.current.descriptionArray.map((action) => action.actionNumber)).toEqual([2, 3]);
    expect(result.current.mouseLinePos).toBe(120);

    act(() => {
      result.current.updateHoverAt(200, 10, null);
    });
    expect(result.current.descriptionArray.map((action) => action.actionNumber)).toEqual([5]);
    expect(result.current.mouseLinePos).toBe(240);

    // Before their first event too.
    act(() => {
      result.current.updateHoverAt(30, 10, null);
    });
    expect(result.current.descriptionArray.map((action) => action.actionNumber)).toEqual([2, 3]);
  });
});
