import tinycolor from 'tinycolor2';
import { describe, expect, it } from 'vitest';
import { getMatchupColors } from './teamColors';

describe('getMatchupColors', () => {
  it.each([
    [false, '#fafafa'],
    [true, '#1e1e1e'],
  ])('keeps matchup text colors readable when dark mode is %s', (darkMode, background) => {
    const colors = getMatchupColors('PHI', 'GSW', darkMode, true);

    expect(tinycolor.readability(colors.away, background)).toBeGreaterThanOrEqual(4.5);
    expect(tinycolor.readability(colors.home, background)).toBeGreaterThanOrEqual(4.5);
  });
});
