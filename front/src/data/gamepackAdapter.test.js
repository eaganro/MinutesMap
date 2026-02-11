import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAMEPACK_STATE,
  adaptGamePackPayload,
  coerceNbaGameId,
  readPlayMeta,
  unpackGamePackPayload,
} from './gamepackAdapter';

describe('gamepackAdapter', () => {
  it('keeps a stable default state shape', () => {
    expect(DEFAULT_GAMEPACK_STATE).toEqual({
      box: {},
      playByPlay: [],
      awayTeamId: null,
      homeTeamId: null,
      nbaGameId: null,
      numPeriods: 4,
      lastAction: null,
    });
  });

  it('normalizes v2 play payload metadata', () => {
    const metadata = readPlayMeta({
      v: 2,
      periods: 5,
      last: {
        quarter: 5,
        time: 'PT01M02.00S',
        awayScore: 120,
        homeScore: 118,
      },
    });

    expect(metadata).toEqual({
      lastAction: {
        period: 5,
        clock: 'PT01M02.00S',
        scoreAway: 120,
        scoreHome: 118,
      },
      numPeriods: 5,
    });
  });

  it('normalizes schemaVersion=1 metadata', () => {
    const metadata = readPlayMeta({
      schemaVersion: 1,
      numPeriods: 3,
      lastAction: {
        period: 3,
        clock: 'PT00M20.00S',
        scoreAway: 79,
        scoreHome: 81,
      },
    });

    expect(metadata).toEqual({
      lastAction: {
        period: 3,
        clock: 'PT00M20.00S',
        scoreAway: 79,
        scoreHome: 81,
      },
      numPeriods: 3,
    });
  });

  it('unpacks combined payloads into box and play sections', () => {
    const payload = {
      nbaGameId: '0022500003',
      box: {
        id: '0022500003',
        teams: {
          away: { id: 10, abbr: 'AWY' },
          home: { id: 20, abbr: 'HME' },
        },
      },
      flow: {
        v: 2,
        periods: 4,
        actions: [{ actionNumber: 701 }],
      },
    };

    expect(unpackGamePackPayload(payload)).toEqual({
      boxData: payload.box,
      playData: payload.flow,
    });

    expect(adaptGamePackPayload(payload)).toEqual(
      expect.objectContaining({
        hasBoxData: true,
        hasPlayData: true,
        awayTeamId: 10,
        homeTeamId: 20,
        nbaGameId: '0022500003',
        numPeriods: 4,
        playData: payload.flow,
      }),
    );
  });

  it('coerces only numeric nba game ids', () => {
    expect(coerceNbaGameId(' 0022500004 ')).toBe('0022500004');
    expect(coerceNbaGameId(22500005)).toBe('22500005');
    expect(coerceNbaGameId('bad-id')).toBeNull();
    expect(coerceNbaGameId(undefined)).toBeNull();
  });
});
