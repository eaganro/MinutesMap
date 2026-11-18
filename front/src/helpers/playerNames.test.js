import { describe, expect, it } from 'vitest';
import { shortPlayerName, shortPlayerNames } from './playerNames';

describe('shortPlayerName', () => {
  it('uses the last name', () => {
    expect(shortPlayerName('Tyrese Maxey')).toBe('Maxey');
    expect(shortPlayerName('VJ Edgecombe')).toBe('Edgecombe');
    expect(shortPlayerName("Day'Ron Sharpe")).toBe('Sharpe');
    expect(shortPlayerName('J. Embiid')).toBe('Embiid');
  });

  it('drops name suffixes', () => {
    expect(shortPlayerName('Michael Porter Jr.')).toBe('Porter');
    expect(shortPlayerName('Trey Murphy III')).toBe('Murphy');
    expect(shortPlayerName('Gary Payton II')).toBe('Payton');
  });

  it('keeps multi-word last names', () => {
    expect(shortPlayerName('Tristan Da Silva')).toBe('Da Silva');
  });

  it('turns long hyphenated last names into initials', () => {
    expect(shortPlayerName('Kentavious Caldwell-Pope')).toBe('KCP');
    expect(shortPlayerName('Shai Gilgeous-Alexander')).toBe('SGA');
    expect(shortPlayerName('Nickeil Alexander-Walker')).toBe('NAW');
  });

  it('keeps short hyphenated last names and hyphenated first names', () => {
    expect(shortPlayerName('Karl-Anthony Towns')).toBe('Towns');
    expect(shortPlayerName('Jo Ann-Lee')).toBe('Ann-Lee');
  });

  it('handles single and empty names', () => {
    expect(shortPlayerName('Nenê')).toBe('Nenê');
    expect(shortPlayerName('')).toBe('');
    expect(shortPlayerName(null)).toBe('');
  });
});

describe('shortPlayerNames', () => {
  it('maps each full name to its short label', () => {
    expect(shortPlayerNames(['Tyrese Maxey', 'Kentavious Caldwell-Pope'])).toEqual({
      'Tyrese Maxey': 'Maxey',
      'Kentavious Caldwell-Pope': 'KCP',
    });
  });

  it('adds a first initial when teammates share a label', () => {
    expect(shortPlayerNames(['Jaylen Brown', 'Mikel Brown Jr.', 'Joel Embiid'])).toEqual({
      'Jaylen Brown': 'J. Brown',
      'Mikel Brown Jr.': 'M. Brown',
      'Joel Embiid': 'Embiid',
    });
  });

  it('uses first names when teammates share a last name and first initial', () => {
    expect(
      shortPlayerNames(['Jalen Williams', 'Jaylin Williams', 'Kenrich Williams', 'Chet Holmgren']),
    ).toEqual({
      'Jalen Williams': 'Jalen',
      'Jaylin Williams': 'Jaylin',
      'Kenrich Williams': 'K. Williams',
      'Chet Holmgren': 'Holmgren',
    });
  });

  it('falls back to full names when nothing shorter tells teammates apart', () => {
    expect(shortPlayerNames(['Gary Payton', 'Gary Payton II'])).toEqual({
      'Gary Payton': 'Gary Payton',
      'Gary Payton II': 'Gary Payton II',
    });
  });
});
