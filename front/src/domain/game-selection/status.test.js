import { describe, expect, it } from 'vitest';
import {
  findFirstStartedOrCompletedGame,
  parseGameSlug,
  parseGameStatus,
  scheduleMatchesDate,
  sortGamesForSelection,
} from './status';

describe('game selection status utils', () => {
  it('normalizes and parses valid game slugs', () => {
    expect(parseGameSlug(' 2026-02-03-PHI-GSW ')).toEqual({
      date: '2026-02-03',
      gameId: '2026-02-03-phi-gsw',
    });
    expect(parseGameSlug('bad-slug')).toBeNull();
  });

  it('classifies final/upcoming/live and canceled/postponed statuses', () => {
    expect(parseGameStatus('Final')).toEqual({
      isFinal: true,
      isUpcoming: false,
      isLive: false,
      status: 'Final',
    });
    expect(parseGameStatus('Postponed')).toEqual({
      isFinal: true,
      isUpcoming: false,
      isLive: false,
      status: 'Postponed',
    });
    expect(parseGameStatus('Canceled')).toEqual({
      isFinal: true,
      isUpcoming: false,
      isLive: false,
      status: 'Canceled',
    });
    expect(parseGameStatus('7:30 PM ET')).toEqual({
      isFinal: false,
      isUpcoming: true,
      isLive: false,
      status: '7:30 PM ET',
    });
    expect(parseGameStatus('TBD')).toEqual({
      isFinal: false,
      isUpcoming: true,
      isLive: false,
      status: 'TBD',
    });
    expect(parseGameStatus('Q3 05:21')).toEqual({
      isFinal: false,
      isUpcoming: false,
      isLive: true,
      status: 'Q3 05:21',
    });
    expect(parseGameStatus('Halftime')).toEqual({
      isFinal: false,
      isUpcoming: false,
      isLive: true,
      status: 'Halftime',
    });
    expect(parseGameStatus('OT')).toEqual({
      isFinal: false,
      isUpcoming: false,
      isLive: true,
      status: 'OT',
    });
  });

  it('sorts games by live, upcoming, final and then by start time', () => {
    const games = [
      { id: 'final', status: 'Final', starttime: '2026-02-03T03:00:00Z', hometeam: 'B' },
      { id: 'upcoming', status: '8:00 PM ET', starttime: '2026-02-03T01:00:00Z', hometeam: 'C' },
      { id: 'live', status: 'Q2 04:10', starttime: '2026-02-03T02:00:00Z', hometeam: 'A' },
    ];

    expect(sortGamesForSelection(games).map((game) => game.id)).toEqual([
      'live',
      'upcoming',
      'final',
    ]);
  });

  it('matches schedules by start-date prefix', () => {
    const games = [
      { starttime: ' 2026-02-03T00:10:00Z ' },
      { starttime: '2026-02-04T01:00:00Z' },
      { starttime: 'malformed' },
    ];

    expect(scheduleMatchesDate(games, '2026-02-03')).toBe(true);
    expect(scheduleMatchesDate(games, '2026-02-05')).toBe(false);
    expect(scheduleMatchesDate([], '2026-02-03')).toBe(false);
  });

  it('uses hometeam as deterministic tie-break when start times are missing', () => {
    const games = [
      { id: 'b', status: '8:00 PM ET', starttime: null, hometeam: 'BOS' },
      { id: 'a', status: '8:00 PM ET', starttime: '', hometeam: 'ATL' },
    ];

    expect(sortGamesForSelection(games).map((game) => game.id)).toEqual(['a', 'b']);
  });

  it('finds the first started/completed game from sorted selection order', () => {
    const games = [
      { id: 'tbd', status: 'TBD', starttime: '2026-02-03T00:00:00Z', hometeam: 'D' },
      { id: 'upcoming', status: '8:00 PM ET', starttime: '2026-02-03T01:00:00Z', hometeam: 'C' },
      { id: 'live', status: 'Q1 10:10', starttime: '2026-02-03T02:00:00Z', hometeam: 'A' },
      { id: 'final', status: 'Final', starttime: '2026-02-03T03:00:00Z', hometeam: 'B' },
    ];

    expect(findFirstStartedOrCompletedGame(games)?.id).toBe('live');
  });
});
