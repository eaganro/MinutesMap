import { describe, expect, it } from 'vitest';
import {
  buildTeamGames,
  deriveSeasonLabel,
  findNearestGameIndex,
  formatShortDate,
  gameIdIncludesTeam,
  NBA_CONFERENCES,
  NBA_TEAM_ABBRS,
  NBA_TEAM_NAMES,
  normalizeTeamAbbr,
  summarizeTeamRecord,
} from './teamSchedule';

const SEASON_PAYLOAD = {
  games: [
    {
      gameId: '2026-10-20-bos-det',
      date: '2026-10-20',
      start: '2026-10-20T15:00:00-04:00',
      homeAway: 'away',
      opponentAbbr: 'DET',
      result: 'L',
      teamScore: 113,
      oppScore: 121,
    },
    {
      gameId: '2026-10-08-bos-cle',
      date: '2026-10-08',
      homeAway: 'away',
      opponentAbbr: 'CLE',
      result: 'W',
      teamScore: 124,
      oppScore: 113,
    },
    {
      gameId: '2026-10-23-nyk-bos',
      date: '2026-10-23',
      start: '2026-10-23T19:00:00',
      homeAway: 'home',
      opponentAbbr: 'NYK',
      status: '7:00 pm ET',
      played: false,
      result: null,
      teamScore: 0,
      oppScore: 0,
    },
  ],
};

describe('teamSchedule', () => {
  it('lists every team once across the conferences, each with a name', () => {
    const conferenceTeams = NBA_CONFERENCES.flatMap((conference) => conference.teams);
    expect([...conferenceTeams].sort()).toEqual([...NBA_TEAM_ABBRS].sort());
    expect(NBA_TEAM_ABBRS.every((abbr) => NBA_TEAM_NAMES[abbr])).toBe(true);
  });

  it('normalizes team abbreviations to the known list', () => {
    expect(normalizeTeamAbbr(' bos ')).toBe('BOS');
    expect(normalizeTeamAbbr('XYZ')).toBeNull();
    expect(normalizeTeamAbbr(null)).toBeNull();
  });

  it('derives the season label with October as the season start', () => {
    expect(deriveSeasonLabel('2026-10-08')).toBe('2026-27');
    expect(deriveSeasonLabel('2026-05-02')).toBe('2025-26');
    expect(deriveSeasonLabel('2099-09-30')).toBe('2098-99');
    expect(deriveSeasonLabel('not-a-date')).toBeNull();
  });

  it('formats short dates without timezone shifts', () => {
    expect(formatShortDate('2026-10-08')).toBe('Oct 8');
    expect(formatShortDate('')).toBe('');
  });

  it('matches teams against game slugs', () => {
    expect(gameIdIncludesTeam('2026-10-23-nyk-bos', 'BOS')).toBe(true);
    expect(gameIdIncludesTeam('2026-10-23-nyk-bos', 'nyk')).toBe(true);
    expect(gameIdIncludesTeam('2026-10-23-nyk-bos', 'MIA')).toBe(false);
    expect(gameIdIncludesTeam('not-a-slug', 'BOS')).toBe(false);
  });

  it('builds a date-ordered strip from the season artifact', () => {
    const games = buildTeamGames({ payload: SEASON_PAYLOAD, team: 'BOS', schedule: [] });

    expect(games.map((game) => game.id)).toEqual([
      '2026-10-08-bos-cle',
      '2026-10-20-bos-det',
      '2026-10-23-nyk-bos',
    ]);
    expect(games[0]).toEqual(
      expect.objectContaining({
        status: 'Final',
        opponent: 'CLE',
        isHome: false,
        awayteam: 'BOS',
        hometeam: 'CLE',
        teamScore: 124,
        oppScore: 113,
        result: 'W',
      }),
    );
    expect(games[2]).toEqual(
      expect.objectContaining({
        status: '7:00 pm ET',
        isHome: true,
        teamScore: null,
        oppScore: null,
        result: null,
      }),
    );
  });

  it('overlays and adds games from the loaded date schedule', () => {
    const games = buildTeamGames({
      payload: SEASON_PAYLOAD,
      team: 'BOS',
      schedule: [
        {
          id: '2026-10-23-nyk-bos',
          awayteam: 'NYK',
          hometeam: 'BOS',
          status: 'Q3 05:12',
          awayscore: 70,
          homescore: 74,
        },
        {
          id: '2026-10-24-bos-phi',
          awayteam: 'BOS',
          hometeam: 'PHI',
          status: 'Final',
          awayscore: 101,
          homescore: 99,
        },
        { id: '2026-10-23-lal-gsw', awayteam: 'LAL', hometeam: 'GSW', status: 'Final' },
      ],
    });

    expect(games.map((game) => game.id)).toEqual([
      '2026-10-08-bos-cle',
      '2026-10-20-bos-det',
      '2026-10-23-nyk-bos',
      '2026-10-24-bos-phi',
    ]);
    expect(games[2]).toEqual(
      expect.objectContaining({ status: 'Q3 05:12', teamScore: 74, oppScore: 70, result: null }),
    );
    expect(games[3]).toEqual(
      expect.objectContaining({ date: '2026-10-24', opponent: 'PHI', result: 'W' }),
    );
  });

  it('shows a live game from the season file as in progress without its placeholder score', () => {
    const [game] = buildTeamGames({
      team: 'SAS',
      payload: {
        games: [
          {
            gameId: '2026-10-28-sas-uta',
            date: '2026-10-28',
            homeAway: 'away',
            opponentAbbr: 'UTA',
            status: 'Halftime',
            played: false,
            result: null,
            teamScore: 0,
            oppScore: 0,
          },
        ],
      },
      schedule: [],
    });

    expect(game).toMatchObject({ status: 'In Progress', teamScore: null, oppScore: null });
  });

  it('finds the last game on or before a date, else the first game', () => {
    const games = buildTeamGames({ payload: SEASON_PAYLOAD, team: 'BOS', schedule: [] });

    expect(findNearestGameIndex(games, '2026-10-21')).toBe(1);
    expect(findNearestGameIndex(games, '2026-10-20')).toBe(1);
    expect(findNearestGameIndex(games, '2026-10-01')).toBe(0);
    expect(findNearestGameIndex(games, null)).toBe(2);
    expect(findNearestGameIndex([], '2026-10-21')).toBe(-1);
  });

  it('summarizes the regular-season record, falling back to preseason', () => {
    const game = (result, seasonType) => ({ result, seasonType });

    expect(
      summarizeTeamRecord([
        game('W', 'preseason'),
        game('L', 'regular'),
        game('W', 'regular'),
        game('W', 'playoffs'),
        game(null, 'regular'),
      ]),
    ).toEqual({ wins: 1, losses: 1, seasonType: 'regular' });
    expect(summarizeTeamRecord([game('W', 'preseason'), game(null, 'regular')])).toEqual({
      wins: 1,
      losses: 0,
      seasonType: 'preseason',
    });
    expect(summarizeTeamRecord([game(null, 'regular')])).toBeNull();
  });

  it('keeps the artifact season type when a schedule row overlays a game', () => {
    const games = buildTeamGames({
      payload: { games: [{ ...SEASON_PAYLOAD.games[1], seasonType: 'preseason' }] },
      team: 'BOS',
      schedule: [{ id: '2026-10-08-bos-cle', awayteam: 'BOS', hometeam: 'CLE', status: 'Final' }],
    });
    expect(games[0].seasonType).toBe('preseason');
  });
});
