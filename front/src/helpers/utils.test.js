import { describe, expect, it } from 'vitest';
import { formatClock, formatPeriod, formatStatusText, timeToSeconds } from './utils';

describe('utils helpers', () => {
  it('parses clock strings into seconds across supported formats', () => {
    expect(timeToSeconds('PT08M13.50S')).toBe(493.5);
    expect(timeToSeconds('8:13.50')).toBe(493.5);
    expect(timeToSeconds('813.50')).toBe(493.5);
    expect(timeToSeconds('bad-clock')).toBe(0);
  });

  it('formats supported clock formats to m:ss', () => {
    expect(formatClock('PT08M13.00S')).toBe('8:13');
    expect(formatClock('0813.00')).toBe('8:13');
    expect(formatClock('8:13.00')).toBe('8:13');
  });

  it('normalizes period and status labels', () => {
    expect(formatPeriod(1)).toBe('Q1');
    expect(formatPeriod(5)).toBe('OT');
    expect(formatPeriod(7)).toBe('3OT');
    expect(formatPeriod(0)).toBe('');

    expect(formatStatusText('ppd')).toBe('Postponed');
    expect(formatStatusText('cancelled')).toBe('Canceled');
    expect(formatStatusText('Q1 :08.0')).toBe('Q1 0:08.0');
  });
});
