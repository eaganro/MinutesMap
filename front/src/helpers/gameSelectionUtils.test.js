import { describe, expect, it } from 'vitest';
import {
  getNbaTodayString,
  parseGameSlug,
  parseGameStatus,
  scheduleMatchesDate,
} from './gameSelectionUtils';

describe('gameSelectionUtils', () => {
  it('normalizes and parses valid game slugs', () => {
    expect(parseGameSlug(' 2026-02-03-PHI-GSW ')).toEqual({
      date: '2026-02-03',
      gameId: '2026-02-03-phi-gsw',
    });
    expect(parseGameSlug('bad-slug')).toBeNull();
  });

  it('classifies game statuses for final/upcoming/live', () => {
    expect(parseGameStatus('Final')).toEqual({
      isFinal: true,
      isUpcoming: false,
      isLive: false,
      status: 'Final',
    });
    expect(parseGameStatus('7:30 PM ET')).toEqual({
      isFinal: false,
      isUpcoming: true,
      isLive: false,
      status: '7:30 PM ET',
    });
    expect(parseGameStatus('Q3 05:21')).toEqual({
      isFinal: false,
      isUpcoming: false,
      isLive: true,
      status: 'Q3 05:21',
    });
  });

  it('uses NBA day boundary at 4:00 AM ET', () => {
    expect(getNbaTodayString(new Date('2025-01-15T07:59:00.000Z'))).toBe('2025-01-14');
    expect(getNbaTodayString(new Date('2025-01-15T09:00:00.000Z'))).toBe('2025-01-15');
  });

  it('matches a schedule by start-date prefix', () => {
    const games = [{ starttime: '2026-02-03T00:10:00Z' }, { starttime: '2026-02-04T01:00:00Z' }];

    expect(scheduleMatchesDate(games, '2026-02-03')).toBe(true);
    expect(scheduleMatchesDate(games, '2026-02-05')).toBe(false);
    expect(scheduleMatchesDate([], '2026-02-03')).toBe(false);
  });
});
