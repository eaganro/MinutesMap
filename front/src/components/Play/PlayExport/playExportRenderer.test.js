import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildPlayExportCanvas: vi.fn(),
}));

vi.mock('./playExportBuilders', () => ({
  buildPlayExportCanvas: mocks.buildPlayExportCanvas,
}));

import { renderExportCanvas } from './playExportRenderer';

describe('playExportRenderer', () => {
  it('renders supported inputs through builders', () => {
    const canvas = { nodeName: 'CANVAS' };
    mocks.buildPlayExportCanvas.mockReturnValue(canvas);

    const result = renderExportCanvas({
      exportView: 'full',
      periodRange: { start: 1, end: 4 },
    });

    expect(mocks.buildPlayExportCanvas).toHaveBeenCalledWith({
      exportView: 'full',
      periodRange: { start: 1, end: 4 },
    });
    expect(result).toBe(canvas);
  });

  it('rejects unsupported export views', () => {
    expect(() =>
      renderExportCanvas({
        exportView: 'bad-view',
        periodRange: { start: 1, end: 4 },
      }),
    ).toThrow('unsupported export view');
  });

  it('rejects player exports without a selected player', () => {
    expect(() =>
      renderExportCanvas({
        exportView: 'player',
        selectedPlayer: null,
        periodRange: { start: 1, end: 4 },
      }),
    ).toThrow('player view requires a selected player');
  });
});
