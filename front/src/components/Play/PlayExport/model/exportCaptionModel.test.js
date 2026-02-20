import { describe, expect, it } from 'vitest';
import { resolveDefaultExportCaption } from './exportCaptionModel';

const CAPTIONS = {
  v: 1,
  periods: {
    1: {
      full: 'Away controls the opening quarter with transition pace.',
      players: [
        {
          team: 'away',
          player: 'Tyrese Maxey',
          caption: 'Maxey sets the tone early with paint pressure and quick reads.',
        },
      ],
    },
    2: {
      full: 'Home steadies the game, but away keeps a slim halftime edge.',
      players: [
        {
          team: 'home',
          player: 'Stephen Curry',
          caption: 'Curry sparks the response with deep range and off-ball movement.',
        },
      ],
    },
  },
};

describe('exportCaptionModel', () => {
  it('resolves full-view captions by range end period', () => {
    expect(
      resolveDefaultExportCaption({
        captions: CAPTIONS,
        exportView: 'full',
        exportRange: { start: 1, end: 2 },
      }),
    ).toBe('Home steadies the game, but away keeps a slim halftime edge.');
  });

  it('falls back to the latest available earlier checkpoint', () => {
    expect(
      resolveDefaultExportCaption({
        captions: CAPTIONS,
        exportView: 'full',
        exportRange: { start: 1, end: 4 },
      }),
    ).toBe('Home steadies the game, but away keeps a slim halftime edge.');
  });

  it('matches player captions by team and player alias', () => {
    expect(
      resolveDefaultExportCaption({
        captions: CAPTIONS,
        exportView: 'player',
        exportRange: { start: 1, end: 1 },
        selectedPlayer: { name: 'Tyrese Maxey#1630178', teamKey: 'away' },
        playerDisplayName: 'Tyrese Maxey',
      }),
    ).toBe('Maxey sets the tone early with paint pressure and quick reads.');
  });

  it('returns empty caption when no player story exists for selection', () => {
    expect(
      resolveDefaultExportCaption({
        captions: CAPTIONS,
        exportView: 'player',
        exportRange: { start: 1, end: 2 },
        selectedPlayer: { name: 'Tyrese Maxey', teamKey: 'away' },
        playerDisplayName: 'Tyrese Maxey',
      }),
    ).toBe('');
  });
});
