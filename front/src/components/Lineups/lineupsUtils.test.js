import { describe, expect, it } from 'vitest';
import { buildLastNameCounts, buildPlayerDisplayNames, formatPlayerName } from './lineupsUtils';

describe('lineupsUtils display names', () => {
  const lineups = [
    {
      key: 'okc-1',
      players: [
        'Jalen Williams',
        'Jaylin Williams',
        'Shai Gilgeous-Alexander',
        'Chet Holmgren',
        'Luguentz Dort',
      ],
      seconds: 300,
      plusMinus: 5,
    },
  ];

  it('builds unique compact labels for players sharing a last name', () => {
    const displayNames = buildPlayerDisplayNames(lineups);

    expect(displayNames.get('Jalen Williams')).toBe('Jal. Williams');
    expect(displayNames.get('Jaylin Williams')).toBe('Jay. Williams');
    expect(displayNames.get('Chet Holmgren')).toBe('Holmgren');
  });

  it('prefers computed display names over first-initial fallback', () => {
    const lastNameCounts = buildLastNameCounts(lineups);
    const displayNames = buildPlayerDisplayNames(lineups);

    expect(formatPlayerName('Jalen Williams', lastNameCounts)).toBe('J. Williams');
    expect(formatPlayerName('Jalen Williams', lastNameCounts, displayNames)).toBe('Jal. Williams');
    expect(formatPlayerName('Jaylin Williams', lastNameCounts, displayNames)).toBe('Jay. Williams');
  });
});
