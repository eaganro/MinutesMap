import { describe, expect, it } from 'vitest';
import { buildExportRequestSnapshot } from './exportRangeModel';

describe('exportRangeModel', () => {
  it('builds export range snapshot metadata', () => {
    expect(
      buildExportRequestSnapshot({
        resolvedExportRange: { start: 1, end: 4, isFullGame: true },
        exportView: 'full',
        exportPlayerKey: '',
        isFinal: true,
      }),
    ).toEqual({
      exportRangeSnapshot: { start: 1, end: 4, isFullGame: true },
      exportPreviewKey: '1-4|full',
      exportIsFullGameRange: true,
      exportRangeLabel: '',
      legendShouldWrap: false,
      endAtLastScore: false,
    });
  });
});
