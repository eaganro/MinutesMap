import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  renderFullExportCanvas: vi.fn(),
  renderLiteExportCanvas: vi.fn(),
  renderPlayerExportCanvas: vi.fn(),
  renderPlayerStackedExportCanvas: vi.fn(),
}));

vi.mock('./render/renderFullExport', () => ({
  renderFullExportCanvas: mocks.renderFullExportCanvas,
}));

vi.mock('./render/renderLiteExport', () => ({
  renderLiteExportCanvas: mocks.renderLiteExportCanvas,
}));

vi.mock('./render/renderPlayerExport', () => ({
  renderPlayerExportCanvas: mocks.renderPlayerExportCanvas,
}));

vi.mock('./render/renderPlayerStackedExport', () => ({
  renderPlayerStackedExportCanvas: mocks.renderPlayerStackedExportCanvas,
}));

import { renderExportCanvas } from './playExportRenderer';

describe('playExportRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes full view to full renderer', () => {
    const canvas = { nodeName: 'CANVAS' };
    mocks.renderFullExportCanvas.mockReturnValue(canvas);

    const result = renderExportCanvas({
      exportView: 'full',
      periodRange: { start: 1, end: 4 },
    });

    expect(mocks.renderFullExportCanvas).toHaveBeenCalledWith({
      exportView: 'full',
      periodRange: { start: 1, end: 4 },
    });
    expect(result).toBe(canvas);
  });

  it('falls back to lite renderer when full renderer returns null', () => {
    const canvas = { nodeName: 'CANVAS-LITE' };
    mocks.renderFullExportCanvas.mockReturnValue(null);
    mocks.renderLiteExportCanvas.mockReturnValue(canvas);

    const result = renderExportCanvas({
      exportView: 'full',
      periodRange: { start: 1, end: 4 },
    });

    expect(mocks.renderLiteExportCanvas).toHaveBeenCalledWith({
      exportView: 'full',
      periodRange: { start: 1, end: 4 },
    });
    expect(result).toBe(canvas);
  });

  it('routes player and stacked views to mode-specific renderers', () => {
    const playerCanvas = { nodeName: 'PLAYER' };
    const stackedCanvas = { nodeName: 'STACKED' };
    mocks.renderPlayerExportCanvas.mockReturnValue(playerCanvas);
    mocks.renderPlayerStackedExportCanvas.mockReturnValue(stackedCanvas);

    const playerResult = renderExportCanvas({
      exportView: 'player',
      selectedPlayer: { name: 'J. Brown' },
      periodRange: { start: 1, end: 4 },
    });
    const stackedResult = renderExportCanvas({
      exportView: 'player-stacked',
      selectedPlayer: { name: 'J. Brown' },
      periodRange: { start: 1, end: 4 },
    });

    expect(mocks.renderPlayerExportCanvas).toHaveBeenCalled();
    expect(mocks.renderPlayerStackedExportCanvas).toHaveBeenCalled();
    expect(playerResult).toBe(playerCanvas);
    expect(stackedResult).toBe(stackedCanvas);
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
