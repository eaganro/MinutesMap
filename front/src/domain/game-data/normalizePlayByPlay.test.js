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
});
