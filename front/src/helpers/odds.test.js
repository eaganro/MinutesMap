import { describe, expect, it } from 'vitest';
import { clampWinProbability, parseWinProbability } from './odds';

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
});
