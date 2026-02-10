import { describe, expect, it } from 'vitest';
import {
  getEventType,
  getFreeThrowAttempt,
  getFreeThrowRingRatio,
  isFreeThrowAction,
  isMissDescription,
  isThreePointAction,
} from './classification';

describe('event classification', () => {
  it('detects miss tokens from varied text', () => {
    expect(isMissDescription('MISS layup')).toBe(true);
    expect(isMissDescription('missed jumper')).toBe(true);
    expect(isMissDescription('makes jumper')).toBe(false);
  });

  it('classifies misses before point-type shot actions', () => {
    expect(getEventType('MISS FT 1 of 2', 'free throw', 'x')).toBe('miss');
    expect(getEventType('makes pullup jumper', '2pt', 'm')).toBe('point');
  });

  it('detects free throws and keeps foul actions separate', () => {
    expect(isFreeThrowAction('MISS FT 1 of 2', 'free throw')).toBe(true);
    expect(isFreeThrowAction('Shooting foul (2 FTs)', 'foul')).toBe(false);
  });

  it('detects 3PT actions from type or description', () => {
    expect(isThreePointAction('Step back jumper', '3pt')).toBe(true);
    expect(isThreePointAction('Makes 3PT pullup', '2pt')).toBe(true);
    expect(isThreePointAction('Makes layup', '2pt')).toBe(false);
  });

  it('parses free-throw attempt metadata', () => {
    expect(getFreeThrowAttempt('MISS FT 2 of 3')).toEqual({ attempt: 2, total: 3 });
    expect(getFreeThrowAttempt('Made free throw', 'FT 1/2')).toEqual({ attempt: 1, total: 2 });
    expect(getFreeThrowAttempt('Technical free throw')).toEqual({ attempt: 1, total: 1 });
  });

  it('uses expected ring ratios for free throws', () => {
    expect(getFreeThrowRingRatio(1, 1)).toBe(0.8);
    expect(getFreeThrowRingRatio(1, 2)).toBe(0.6);
    expect(getFreeThrowRingRatio(2, 2)).toBe(0.8);
    expect(getFreeThrowRingRatio(3, 3)).toBe(1.1);
  });
});
