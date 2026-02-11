import { describe, expect, it } from 'vitest';
import { buildExportOutputMetadata, buildExportPreviewState } from './exportPreviewModel';

describe('exportPreviewModel', () => {
  it('builds output metadata and preview state', () => {
    const metadata = buildExportOutputMetadata({
      awayTeamNames: { abr: 'PHI', name: '76ers' },
      homeTeamNames: { abr: 'GSW', name: 'Warriors' },
      rangeLabel: 'Q3',
      isFullGameRange: false,
      gameId: '2026-02-03-phi-gsw',
      origin: 'https://minutesmap.com',
    });

    expect(metadata.fileName).toBe('PHI-vs-GSW-Q3-2026-02-03-phi-gsw.png');
    expect(metadata.shareMetadata).toEqual({
      title: '76ers vs Warriors (Q3)',
      text: 'Play-by-play chart for 76ers vs Warriors (Q3).',
      url: 'https://minutesmap.com/2026-02-03-phi-gsw',
    });

    const preview = buildExportPreviewState({
      url: 'blob:test',
      fileName: metadata.fileName,
      file: { name: metadata.fileName },
      canShare: true,
      shareMetadata: metadata.shareMetadata,
      isUpdating: false,
    });

    expect(preview).toEqual(
      expect.objectContaining({
        url: 'blob:test',
        fileName: 'PHI-vs-GSW-Q3-2026-02-03-phi-gsw.png',
        canShare: true,
        shareTitle: '76ers vs Warriors (Q3)',
        shareUrl: 'https://minutesmap.com/2026-02-03-phi-gsw',
      }),
    );
  });
});
