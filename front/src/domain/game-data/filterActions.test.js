import { describe, expect, it } from 'vitest';
import {
  filterActions,
  filterPlayerActions,
  sortActions,
  STAT_TOGGLE_INDEX,
} from './filterActions';

const toggleVector = (enabledIndices = []) => {
  const toggles = new Array(8).fill(false);
  enabledIndices.forEach((idx) => {
    toggles[idx] = true;
  });
  return toggles;
};

describe('filterActions', () => {
  it('keeps stat toggle index meanings stable', () => {
    expect(STAT_TOGGLE_INDEX).toEqual({
      MAKE: 0,
      MISS: 1,
      REBOUND: 2,
      ASSIST: 3,
      TURNOVER: 4,
      BLOCK: 5,
      STEAL: 6,
      FOUL: 7,
    });
  });

  it('classifies makes and misses using result, type, and miss tokens', () => {
    const makeAction = { actionType: '2pt', description: 'Driving layup', result: 'm' };
    const missAction = { actionType: '2pt', description: 'MISSED Jump Shot', result: 'x' };

    expect(filterActions(makeAction, toggleVector([STAT_TOGGLE_INDEX.MAKE]))).toBe(true);
    expect(filterActions(makeAction, toggleVector([STAT_TOGGLE_INDEX.MISS]))).toBe(false);

    expect(filterActions(missAction, toggleVector([STAT_TOGGLE_INDEX.MISS]))).toBe(true);
    expect(filterActions(missAction, toggleVector([STAT_TOGGLE_INDEX.MAKE]))).toBe(false);
  });

  it('filters player maps using the requested toggles', () => {
    const playerMap = {
      'A Player': [
        { actionType: 'assist', description: 'assist' },
        { actionType: 'turnover', description: 'turnover' },
      ],
      'B Player': [{ actionType: 'rebound', description: 'rebound' }],
    };

    expect(filterPlayerActions(playerMap, toggleVector([STAT_TOGGLE_INDEX.ASSIST]))).toEqual({
      'A Player': [{ actionType: 'assist', description: 'assist' }],
      'B Player': [],
    });
  });
});

describe('sortActions', () => {
  it('sorts by period asc then clock desc', () => {
    const actions = [
      { actionNumber: 3, period: 2, clock: 'PT11M00.00S' },
      { actionNumber: 2, period: 1, clock: 'PT08M00.00S' },
      { actionNumber: 1, period: 1, clock: 'PT09M00.00S' },
    ];

    expect(sortActions(actions).map((entry) => entry.actionNumber)).toEqual([1, 2, 3]);
  });

  it('remains deterministic when period/clock are tied', () => {
    const actions = [
      { actionNumber: 'A', period: 1, clock: 'PT10M00.00S' },
      { actionNumber: 'B', period: 1, clock: 'PT10M00.00S' },
      { actionNumber: 'C', period: 1, clock: 'PT10M00.00S' },
    ];

    const first = sortActions(actions).map((entry) => entry.actionNumber);

    for (let i = 0; i < 5; i += 1) {
      expect(sortActions(actions).map((entry) => entry.actionNumber)).toEqual(first);
    }
  });
});
