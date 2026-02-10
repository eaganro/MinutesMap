import { describe, expect, it } from 'vitest';
import {
  EMPTY_TIMELINE_DATA,
  normalizePlayByPlay,
  isLegacyPlayByPlayPayload,
  isCompactPlayByPlayPayload,
} from './normalizePlayByPlay';
import {
  compactPlayByPlayPayload,
  expectedCompactNormalized,
  expectedLegacyNormalized,
  legacyPlayByPlayPayload,
} from './__fixtures__/playByPlayFixtures';

describe('normalizePlayByPlay', () => {
  it('returns empty timeline shape for unsupported payloads', () => {
    expect(normalizePlayByPlay(null)).toEqual(EMPTY_TIMELINE_DATA);
    expect(normalizePlayByPlay([])).toEqual(EMPTY_TIMELINE_DATA);
    expect(normalizePlayByPlay({ schemaVersion: 2 })).toEqual(EMPTY_TIMELINE_DATA);
  });

  it('detects legacy and compact payload formats', () => {
    expect(isLegacyPlayByPlayPayload(legacyPlayByPlayPayload)).toBe(true);
    expect(isCompactPlayByPlayPayload(legacyPlayByPlayPayload)).toBe(false);

    expect(isLegacyPlayByPlayPayload(compactPlayByPlayPayload)).toBe(false);
    expect(isCompactPlayByPlayPayload(compactPlayByPlayPayload)).toBe(true);
  });

  it('normalizes legacy payload without changing core shape', () => {
    expect(normalizePlayByPlay(legacyPlayByPlayPayload)).toEqual(expectedLegacyNormalized);
  });

  it('normalizes compact payload to the legacy-compatible contract', () => {
    expect(normalizePlayByPlay(compactPlayByPlayPayload)).toEqual(expectedCompactNormalized);
  });

  it('normalizes compact payloads with sparse/malformed player actions safely', () => {
    const sparsePayload = {
      v: 2,
      score: [{ quarter: 1, time: 'PT12M00.00S', awayScore: 0, homeScore: 0 }],
      players: {
        away: {
          'Away Guard': [
            null,
            {
              quarter: 1,
              time: 'PT11M20.00S',
              type: '2pt',
              text: 'Away Guard makes layup',
              r: 'm',
              seq: 5001,
              awayScore: 2,
              homeScore: 0,
            },
          ],
        },
        home: null,
      },
      segments: {
        away: {
          'Away Guard': [{ quarter: 1, start: 'PT12M00.00S', end: 'PT00M00.00S' }],
        },
        home: null,
      },
    };

    const normalized = normalizePlayByPlay(sparsePayload);

    expect(normalized.scoreTimeline).toEqual([
      {
        period: 1,
        clock: 'PT12M00.00S',
        away: 0,
        home: 0,
      },
    ]);
    expect(normalized.awayActionsAll['Away Guard']).toHaveLength(1);
    expect(normalized.homeActionsAll).toEqual({});
    expect(normalized.allActions.map((entry) => entry.actionNumber)).toEqual([5001]);
  });
});
