import { describe, expect, it } from 'vitest';
import {
  buildExportDimensions,
  buildExportPlayerOptions,
  buildExportPreviewKey,
  buildExportRangeOptions,
  buildPlayExportFileName,
  buildShareMetadata,
  resolveFullNameFromRoster,
} from './playExportModel';

describe('playExportModel', () => {
  it('builds stable export file names', () => {
    expect(
      buildPlayExportFileName({
        awayTeamNames: { abr: 'PHI' },
        homeTeamNames: { abr: 'GSW' },
        rangeLabel: 'Q1-Q2',
        isFullGameRange: false,
        gameId: '2026-02-03-phi-gsw',
      }),
    ).toBe('PHI-vs-GSW-Q1-Q2-2026-02-03-phi-gsw.png');
  });

  it('builds share metadata with range and game URL', () => {
    expect(
      buildShareMetadata({
        awayTeamNames: { name: '76ers', abr: 'PHI' },
        homeTeamNames: { name: 'Warriors', abr: 'GSW' },
        rangeLabel: 'Q3',
        gameId: '2026-02-03-phi-gsw',
        origin: 'https://minutesmap.com',
      }),
    ).toEqual({
      title: '76ers vs Warriors (Q3)',
      text: 'Play-by-play chart for 76ers vs Warriors (Q3).',
      url: 'https://minutesmap.com/2026-02-03-phi-gsw',
    });
  });

  it('resolves player initials to full roster name when unambiguous', () => {
    const roster = [
      { first: 'Jaylen', last: 'Brown' },
      { first: 'Jayson', last: 'Tatum' },
    ];
    expect(resolveFullNameFromRoster('J. Brown', roster)).toBe('Jaylen Brown');
    expect(resolveFullNameFromRoster('Jayson Tatum', roster)).toBe('Jayson Tatum');
  });

  it('builds player options and preview keys', () => {
    const options = buildExportPlayerOptions({
      displayAwayPlayers: { 'J. Brown': [] },
      displayHomePlayers: { Curry: [] },
      displayAwayTeamNames: { abr: 'BOS' },
      displayHomeTeamNames: { abr: 'GSW' },
    });
    expect(options.map((option) => option.key)).toEqual(['away:J. Brown', 'home:Curry']);
    expect(
      buildExportPreviewKey({
        exportRange: { start: 1, end: 4 },
        exportView: 'full',
        exportPlayerKey: 'away:J. Brown',
      }),
    ).toBe('1-4|full');
    expect(
      buildExportPreviewKey({
        exportRange: { start: 2, end: 3 },
        exportView: 'player',
        exportPlayerKey: 'away:J. Brown',
      }),
    ).toBe('2-3|player|away:J. Brown');
  });

  it('builds range options and export dimensions by view', () => {
    expect(buildExportRangeOptions(3)).toEqual([
      { period: 1, label: 'Q1' },
      { period: 2, label: 'Q2' },
      { period: 3, label: 'Q3' },
    ]);
    expect(
      buildExportDimensions({
        exportView: 'full',
        isFullGameRange: true,
        durationRatio: 0.5,
      }).exportWidth,
    ).toBe(1235);
    expect(
      buildExportDimensions({
        exportView: 'player-stacked',
        isFullGameRange: false,
        durationRatio: 0.25,
      }).exportWidth,
    ).toBe(360);
  });
});
