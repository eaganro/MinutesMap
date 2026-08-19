import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isBooleanArrayPreference,
  isBooleanPreference,
  readStoredValue,
  writeStoredValue,
} from './storage';

describe('safe preference storage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('removes corrupt JSON and falls back', () => {
    localStorage.setItem('preference', '{broken');

    expect(readStoredValue('preference', false, { validate: isBooleanPreference })).toBe(false);
    expect(localStorage.getItem('preference')).toBeNull();
  });

  it('removes values with the wrong type or shape', () => {
    localStorage.setItem('booleanPreference', JSON.stringify('true'));
    localStorage.setItem('arrayPreference', JSON.stringify([true, false, 'false']));
    localStorage.setItem('shortArrayPreference', JSON.stringify([true, false]));

    expect(readStoredValue('booleanPreference', true, { validate: isBooleanPreference })).toBe(
      true,
    );
    expect(
      readStoredValue('arrayPreference', [false, false, false], {
        validate: isBooleanArrayPreference(3),
      }),
    ).toEqual([false, false, false]);
    expect(
      readStoredValue('shortArrayPreference', [false, false, false], {
        validate: isBooleanArrayPreference(3),
      }),
    ).toEqual([false, false, false]);
    expect(localStorage.getItem('booleanPreference')).toBeNull();
    expect(localStorage.getItem('arrayPreference')).toBeNull();
    expect(localStorage.getItem('shortArrayPreference')).toBeNull();
  });

  it('migrates an old value before validating and persists the result', () => {
    localStorage.setItem('versionedPreference', JSON.stringify({ enabled: true, version: 1 }));

    const value = readStoredValue('versionedPreference', false, {
      migrate: (stored) => (stored?.version === 1 ? stored.enabled : stored),
      validate: isBooleanPreference,
    });

    expect(value).toBe(true);
    expect(localStorage.getItem('versionedPreference')).toBe('true');
  });

  it('returns valid stored preferences unchanged', () => {
    const preference = [true, false, true];
    localStorage.setItem('preference', JSON.stringify(preference));

    expect(readStoredValue('preference', [], { validate: isBooleanArrayPreference(3) })).toEqual(
      preference,
    );
  });

  it('falls back when storage reads are denied', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError');
    });

    expect(readStoredValue('preference', true, { validate: isBooleanPreference })).toBe(true);
  });

  it('does not throw when storage writes fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });

    expect(writeStoredValue('preference', true)).toBe(false);
  });
});
