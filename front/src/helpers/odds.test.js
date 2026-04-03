import { describe, expect, it } from 'vitest';
import {
  clampWinProbability,
  findWinProbabilityAtOrBefore,
  formatWinProbabilityPercent,
  parseWinProbability,
} from './odds';

describe('odds helpers', () => {
  it('treats missing values as absent probabilities', () => {
    expect(parseWinProbability(null)).toBeNull();
    expect(parseWinProbability(undefined)).toBeNull();
    expect(parseWinProbability('')).toBeNull();
    expect(parseWinProbability('   ')).toBeNull();
    expect(parseWinProbability(false)).toBeNull();
  });

  it('preserves valid values and clamps them into the chart domain', () => {
    expect(parseWinProbability(0)).toBe(0);
    expect(parseWinProbability('0')).toBe(0);
    expect(clampWinProbability(0.58)).toBe(0.58);
    expect(clampWinProbability('0.58')).toBe(0.58);
    expect(clampWinProbability(-1)).toBe(0);
    expect(clampWinProbability(2)).toBe(1);
  });

  it('formats percentages and resolves the latest known odds at a timestamp', () => {
    const oddsTimeline = [
      { period: 1, clock: 'PT11M30.00S', awayWinProb: 0.54 },
      { period: 1, clock: 'PT10M00.00S', awayWinProb: 0.67 },
      { period: 1, clock: 'PT09M30.00S', awayWinProb: null },
    ];

    expect(formatWinProbabilityPercent(0.585)).toBe('58.5%');
    expect(formatWinProbabilityPercent(0.58)).toBe('58%');
    expect(findWinProbabilityAtOrBefore(oddsTimeline, 1, 'PT11M00.00S')).toBe(0.54);
    expect(findWinProbabilityAtOrBefore(oddsTimeline, 1, 'PT10M00.00S')).toBe(0.67);
    expect(findWinProbabilityAtOrBefore(oddsTimeline, 1, 'PT11M59.00S')).toBeNull();
  });
});
