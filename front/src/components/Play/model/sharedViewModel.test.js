import { describe, expect, it } from 'vitest';
import {
  buildSharedView,
  buildSharedViewQuery,
  parseSharedView,
  removeSharedViewParams,
} from './sharedViewModel';

describe('sharedViewModel', () => {
  it('describes a share image as one period, or the whole game for longer ranges', () => {
    expect(buildSharedView({ exportView: 'full', exportRange: { start: 4, end: 4 } })).toEqual({
      period: 4,
    });
    expect(buildSharedView({ exportView: 'full', exportRange: { start: 3, end: 4 } })).toEqual({
      period: 0,
    });
    expect(
      buildSharedView({
        exportView: 'player-stacked',
        exportRange: { start: 1, end: 4 },
        playerName: 'Joel Embiid',
      }),
    ).toEqual({ period: 0, playerName: 'Joel Embiid' });
    // The full chart never names a player, whatever was last picked in the builder.
    expect(
      buildSharedView({
        exportView: 'full',
        exportRange: { start: 2, end: 2 },
        playerName: 'Joel Embiid',
      }),
    ).toEqual({ period: 2 });
  });

  it('writes and reads the view back from a link', () => {
    const query = buildSharedViewQuery({ period: 4, playerName: 'Joel Embiid' });
    expect(query).toBe('?q=4&player=Joel+Embiid');
    expect(parseSharedView(query)).toEqual({ period: 4, playerName: 'Joel Embiid' });

    expect(buildSharedViewQuery({ period: 0 })).toBe('?q=game');
    expect(parseSharedView('?q=game')).toEqual({ period: 0, playerName: null });
    expect(buildSharedViewQuery(null)).toBe('');
  });

  it('ignores links without a readable view', () => {
    expect(parseSharedView('')).toBeNull();
    expect(parseSharedView('?team=PHI')).toBeNull();
    expect(parseSharedView('?q=abc')).toBeNull();
    expect(parseSharedView('?q=0')).toBeNull();
    expect(parseSharedView('?q=abc&player=Joel+Embiid')).toEqual({
      period: null,
      playerName: 'Joel Embiid',
    });
  });

  it('removes only the shared-view parameters from a URL', () => {
    expect(
      removeSharedViewParams('https://minutesmap.com/2026-11-06-phi-cle?q=4&team=PHI&player=X#a'),
    ).toBe('/2026-11-06-phi-cle?team=PHI#a');
    expect(removeSharedViewParams('https://minutesmap.com/2026-11-06-phi-cle?q=4')).toBe(
      '/2026-11-06-phi-cle',
    );
  });
});
