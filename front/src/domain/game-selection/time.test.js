import { describe, expect, it } from 'vitest';
import { getNbaTodayString, parseStartTimeEt, shiftDateString } from './time';

describe('game selection time utils', () => {
  it('uses NBA day boundary at 4:00 AM ET', () => {
    expect(getNbaTodayString(new Date('2025-01-15T07:59:00.000Z'))).toBe('2025-01-14');
    expect(getNbaTodayString(new Date('2025-01-15T09:00:00.000Z'))).toBe('2025-01-15');
  });

  it('parses ET local timestamps and offset timestamps', () => {
    expect(parseStartTimeEt('2026-02-03T19:30:00')?.toISOString()).toBe('2026-02-04T00:30:00.000Z');
    expect(parseStartTimeEt('2026-02-03T19:30:00-05:00')?.toISOString()).toBe(
      '2026-02-04T00:30:00.000Z',
    );
  });

  it('keeps existing handling for Z-suffixed timestamps', () => {
    expect(parseStartTimeEt('2026-02-03T19:30:00Z')?.toISOString()).toBe(
      '2026-02-04T00:30:00.000Z',
    );
  });

  it('parses space-delimited and no-seconds ET timestamps', () => {
    expect(parseStartTimeEt('2026-02-03 19:30')?.toISOString()).toBe('2026-02-04T00:30:00.000Z');
  });

  it('returns null for invalid start times', () => {
    expect(parseStartTimeEt('')).toBeNull();
    expect(parseStartTimeEt('   ')).toBeNull();
    expect(parseStartTimeEt('not-a-date')).toBeNull();
  });

  it('shifts date strings by day offsets', () => {
    expect(shiftDateString('2026-02-03', 1)).toBe('2026-02-04');
    expect(shiftDateString('2026-02-03', -2)).toBe('2026-02-01');
    expect(shiftDateString('', 1)).toBeNull();
  });
});
