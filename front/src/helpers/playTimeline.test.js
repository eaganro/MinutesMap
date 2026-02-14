import { describe, expect, it } from 'vitest';
import { getGameTotalSeconds } from './playTimeline';

describe('playTimeline', () => {
  it('scales total seconds for games shorter than four periods', () => {
    expect(getGameTotalSeconds(1)).toBe(12 * 60);
    expect(getGameTotalSeconds(2)).toBe(24 * 60);
    expect(getGameTotalSeconds(4)).toBe(48 * 60);
    expect(getGameTotalSeconds(5)).toBe(53 * 60);
  });

  it('falls back to regulation length when period count is invalid', () => {
    expect(getGameTotalSeconds(0)).toBe(48 * 60);
    expect(getGameTotalSeconds(undefined)).toBe(48 * 60);
  });
});
