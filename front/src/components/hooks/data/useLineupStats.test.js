import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLineupStats } from './useLineupStats';

describe('useLineupStats', () => {
  it('retains non-5-player intervals when building lineups', () => {
    const awayPlayerTimeline = {
      A: [{ period: 1, start: '1200.00', end: '0000.00' }],
      B: [{ period: 1, start: '1200.00', end: '0000.00' }],
      C: [{ period: 1, start: '1200.00', end: '0000.00' }],
      D: [{ period: 1, start: '1200.00', end: '0000.00' }],
      E: [{ period: 1, start: '1200.00', end: '0800.00' }],
      F: [{ period: 1, start: '1200.00', end: '0400.00' }],
      G: [{ period: 1, start: '0200.00', end: '0000.00' }],
    };

    const scoreTimeline = [
      { quarter: 1, time: '1200.00', homeScore: 0, awayScore: 0 },
      { quarter: 1, time: '0000.00', homeScore: 0, awayScore: 0 },
    ];

    const { result } = renderHook(() =>
      useLineupStats({
        awayPlayerTimeline,
        homePlayerTimeline: {},
        scoreTimeline,
        numPeriods: 4,
      }),
    );

    const awayLineups = result.current.away;
    expect(awayLineups).toHaveLength(4);
    expect(
      awayLineups
        .map((lineup) => lineup.players.join('|'))
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(['A|B|C|D', 'A|B|C|D|E|F', 'A|B|C|D|F', 'A|B|C|D|G']);
    expect(
      awayLineups
        .map((lineup) => lineup.seconds)
        .sort((a, b) => a - b),
    ).toEqual([120, 120, 240, 240]);
  });
});
