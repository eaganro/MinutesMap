import { describe, expect, it } from 'vitest';
import {
  clampExportCaption,
  FULL_EXPORT_CAPTION_MAX_LENGTH,
  PLAYER_EXPORT_CAPTION_MAX_LENGTH,
  resolveDefaultExportCaption,
  resolveExportCaptionLimits,
  resolveExportCaptionMaxLength,
  resolveFullCaptionPeriods,
  resolvePlayerCaptionPeriods,
} from './exportCaptionModel';

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

  it('returns empty when no exact period checkpoint exists', () => {
    expect(
      resolveDefaultExportCaption({
        captions: CAPTIONS,
        exportView: 'full',
        exportRange: { start: 1, end: 4 },
      }),
    ).toBe('');
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

  it('resolves all period checkpoints that include a player caption', () => {
    expect(
      resolvePlayerCaptionPeriods({
        captions: CAPTIONS,
        selectedPlayer: { name: 'Stephen Curry', teamKey: 'home' },
        playerDisplayName: 'Stephen Curry',
      }),
    ).toEqual([2]);
  });

  it('resolves full caption checkpoints', () => {
    expect(resolveFullCaptionPeriods({ captions: CAPTIONS })).toEqual([1, 2]);
  });

  it('resolves max caption length by view', () => {
    expect(resolveExportCaptionMaxLength({ exportView: 'full' })).toBe(
      FULL_EXPORT_CAPTION_MAX_LENGTH,
    );
    expect(resolveExportCaptionMaxLength({ exportView: 'player' })).toBe(
      PLAYER_EXPORT_CAPTION_MAX_LENGTH,
    );
  });

  it('uses backend-provided caption limits when available', () => {
    const captions = { limits: { full: 111, player: 77 } };
    expect(resolveExportCaptionLimits({ captions })).toEqual({ full: 111, player: 77 });
    expect(resolveExportCaptionMaxLength({ captions, exportView: 'full' })).toBe(111);
    expect(resolveExportCaptionMaxLength({ captions, exportView: 'player' })).toBe(77);
  });

  it('clamps captions to the configured max length', () => {
    expect(
      clampExportCaption({
        text: 'x'.repeat(FULL_EXPORT_CAPTION_MAX_LENGTH + 10),
        exportView: 'full',
      }),
    ).toHaveLength(FULL_EXPORT_CAPTION_MAX_LENGTH);
    expect(
      clampExportCaption({
        text: 'y'.repeat(PLAYER_EXPORT_CAPTION_MAX_LENGTH + 10),
        exportView: 'player',
      }),
    ).toHaveLength(PLAYER_EXPORT_CAPTION_MAX_LENGTH);
    expect(
      clampExportCaption({
        text: 'z'.repeat(30),
        exportView: 'player',
        captions: { limits: { player: 12 } },
      }),
    ).toHaveLength(12);
  });
});
