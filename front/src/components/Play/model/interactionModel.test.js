import { describe, expect, it } from 'vitest';
import {
  calculateTimelineXPosition,
  findClosestActionByPosition,
  getAdjacentAction,
  getCurrentActionIndex,
  groupActionsByTimestamp,
} from './interactionModel';

const ACTIONS = [
  { actionNumber: 1, period: 1, clock: 'PT11M00.00S' },
  { actionNumber: 2, period: 1, clock: 'PT11M00.00S' },
  { actionNumber: 3, period: 1, clock: 'PT10M00.00S' },
];

describe('interactionModel', () => {
  it('calculates timeline x position with window offset and left margin', () => {
    const x = calculateTimelineXPosition({
      clock: 'PT11M00.00S',
      period: 1,
      timelineWindow: { startSeconds: 0, durationSeconds: 2880 },
      timelineWidth: 500,
      leftMargin: 96,
    });

    expect(x).toBeGreaterThan(96);
    expect(x).toBeLessThan(110);
  });

  it('resolves current index and adjacent actions skipping same-time entries', () => {
    const index = getCurrentActionIndex(ACTIONS, [1], [ACTIONS[0]]);
    expect(index).toBe(0);

    const next = getAdjacentAction(ACTIONS, index, 1);
    const prev = getAdjacentAction(ACTIONS, 2, -1);
    expect(next?.actionNumber).toBe(3);
    expect(prev?.actionNumber).toBe(2);
  });

  it('groups actions by timestamp and finds closest action by cursor position', () => {
    const grouped = groupActionsByTimestamp(ACTIONS, ACTIONS[0]);
    expect(grouped.map((entry) => entry.actionNumber)).toEqual([1, 2]);

    const closest = findClosestActionByPosition({
      allActions: ACTIONS,
      rawPosition: 34,
      leftMargin: 96,
      calculateXPosition: (clock) => (clock === 'PT10M00.00S' ? 138 : 106),
    });

    expect(closest?.actionNumber).toBe(2);
  });
});
