import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  renderExportCanvas: vi.fn(),
  loadTeamLogosForExport: vi.fn(),
  canvasToBlob: vi.fn(),
  createPngFile: vi.fn(),
  detectShareSupport: vi.fn(),
  createObjectUrl: vi.fn(),
  revokeObjectUrl: vi.fn(),
  shareFile: vi.fn(),
  trackFeatureUse: vi.fn(),
}));

vi.mock('./playExportRenderer', () => ({
  renderExportCanvas: mocks.renderExportCanvas,
}));

vi.mock('./playExportAssets', () => ({
  loadTeamLogosForExport: mocks.loadTeamLogosForExport,
}));

vi.mock('./playExportTransport', async () => {
  const actual = await vi.importActual('./playExportTransport');
  return {
    ...actual,
    canvasToBlob: mocks.canvasToBlob,
    createPngFile: mocks.createPngFile,
    detectShareSupport: mocks.detectShareSupport,
    createObjectUrl: mocks.createObjectUrl,
    revokeObjectUrl: mocks.revokeObjectUrl,
    shareFile: mocks.shareFile,
  };
});

vi.mock('../../../helpers/analytics', () => ({
  trackFeatureUse: mocks.trackFeatureUse,
}));

import { usePlayExportController } from './usePlayExportController';

const buildProps = () => ({
  playRef: { current: document.createElement('div') },
  gameId: '2026-02-03-phi-gsw',
  gameStatus: 'Q1 10:00',
  box: {
    teams: {
      away: {
        players: [{ first: 'Jaylen', last: 'Brown' }],
      },
      home: { players: [] },
    },
  },
  exportData: {
    stablePlayData: {
      gameDate: '2026-02-03',
      awayTeamNames: { abr: 'PHI', name: '76ers' },
      homeTeamNames: { abr: 'GSW', name: 'Warriors' },
      playerActions: {
        away: {
          filtered: {
            'J. Brown': [
              {
                period: 1,
                clock: 'PT10M00.00S',
                actionType: '2pt',
                description: 'Jump Shot',
                result: 'made',
              },
            ],
          },
          all: {
            'J. Brown': [
              {
                period: 1,
                clock: 'PT10M00.00S',
                actionType: '2pt',
                description: 'Jump Shot',
                result: 'made',
              },
            ],
          },
        },
        home: { filtered: {}, all: {} },
      },
      awayPlayerTimeline: {
        'J. Brown': [{ period: 1, start: 'PT12M00.00S', end: 'PT00M00.00S' }],
      },
      homePlayerTimeline: {},
      scoreTimeline: [
        { period: 1, clock: 'PT12M00.00S', away: 0, home: 0 },
        { period: 1, clock: 'PT10M00.00S', away: 2, home: 0 },
      ],
      lastAction: { period: 1, clock: 'PT10M00.00S' },
      captions: {
        v: 1,
        periods: {
          1: {
            full: 'Philadelphia controls the opening stretch with pace and pressure.',
            players: [
              {
                team: 'away',
                player: 'J. Brown',
                caption: 'Brown attacks early and keeps pressure on the defense.',
              },
            ],
          },
        },
      },
    },
    periodData: {
      timelineWindow: { startSeconds: 0, durationSeconds: 2880 },
    },
    hasDisplayData: true,
    isDataLoading: false,
    isFinal: false,
    numPeriods: 4,
    leftMargin: 96,
    rightMargin: 10,
    showScoreDiff: true,
    statOn: [true, false, true, true, false, false, false, false],
    teamColors: { away: '#f00', home: '#00f' },
    awayColor: '#f00',
    homeColor: '#00f',
  },
  onExportInteractionStart: vi.fn(),
});

describe('usePlayExportController', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }),
    });
    mocks.renderExportCanvas.mockReturnValue({
      toDataURL: () => 'data:image/png;base64,SGVsbG8=',
    });
    mocks.loadTeamLogosForExport.mockResolvedValue({ away: null, home: null });
    mocks.canvasToBlob.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    mocks.createPngFile.mockReturnValue({
      file: new File([new Blob(['png'])], 'export.png', { type: 'image/png' }),
      errorMessage: null,
    });
    mocks.detectShareSupport.mockReturnValue({ canShareFiles: false, errorMessage: null });
    mocks.createObjectUrl.mockReturnValue('blob:preview-url');
    mocks.revokeObjectUrl.mockImplementation(() => {});
    mocks.shareFile.mockResolvedValue({ shared: true, aborted: false, error: null });
  });

  it('builds export preview state through renderer and transport', async () => {
    const props = buildProps();
    const resolvedLogos = { away: { nodeName: 'IMG' }, home: { nodeName: 'IMG' } };
    mocks.loadTeamLogosForExport.mockResolvedValueOnce(resolvedLogos);
    const { result } = renderHook(() => usePlayExportController(props));

    await act(async () => {
      await result.current.handleExportImage();
    });

    expect(props.onExportInteractionStart).toHaveBeenCalledTimes(1);
    expect(mocks.trackFeatureUse).toHaveBeenCalledWith('image-builder');
    expect(mocks.renderExportCanvas).toHaveBeenCalledTimes(1);
    expect(mocks.renderExportCanvas).toHaveBeenCalledWith(
      expect.objectContaining({
        captionText: 'Philadelphia controls the opening stretch with pace and pressure.',
        teamLogos: resolvedLogos,
      }),
    );
    expect(result.current.exportPreview?.url).toBe('blob:preview-url');
    expect(result.current.exportPreview?.captionText).toBe(
      'Philadelphia controls the opening stretch with pace and pressure.',
    );
    expect(result.current.exportError).toBeNull();
  });

  it('prioritizes players with captions and defaults selection to one', async () => {
    const props = buildProps();
    props.exportData.stablePlayData.playerActions.away.filtered = {
      'A. NoCaption': [],
      'J. Brown': [
        {
          period: 1,
          clock: 'PT10M00.00S',
          actionType: '2pt',
          description: 'Jump Shot',
          result: 'made',
        },
      ],
    };
    props.exportData.stablePlayData.playerActions.away.all = {
      ...props.exportData.stablePlayData.playerActions.away.filtered,
    };
    props.exportData.stablePlayData.awayPlayerTimeline = {
      'A. NoCaption': [],
      'J. Brown': [{ period: 1, start: 'PT12M00.00S', end: 'PT00M00.00S' }],
    };
    props.exportData.stablePlayData.captions = {
      v: 1,
      periods: {
        1: {
          full: 'Philadelphia controls the opening stretch with pace and pressure.',
          players: [
            {
              team: 'away',
              player: 'J. Brown',
              caption: 'Brown attacks early and keeps pressure on the defense.',
            },
          ],
        },
      },
    };

    const { result } = renderHook(() => usePlayExportController(props));

    await waitFor(() => {
      expect(result.current.exportPlayerOptions[0]?.key).toBe('away:J. Brown');
    });
    expect(result.current.exportPlayerOptions[0]?.label).toContain('[caption]');
    expect(result.current.exportPlayerKey).toBe('away:J. Brown');
  });

  it('auto-refreshes preview when export settings change', async () => {
    mocks.createObjectUrl.mockReset();
    mocks.createObjectUrl.mockReturnValueOnce('blob:first-preview');
    mocks.createObjectUrl.mockReturnValueOnce('blob:second-preview');

    const { result } = renderHook(() => usePlayExportController(buildProps()));

    await act(async () => {
      await result.current.handleExportImage();
    });
    expect(mocks.renderExportCanvas).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.setExportPlayerKey('away:J. Brown');
      result.current.setExportView('player');
    });

    await waitFor(() => {
      expect(mocks.renderExportCanvas).toHaveBeenCalledTimes(2);
    });
    expect(mocks.renderExportCanvas).toHaveBeenLastCalledWith(
      expect.objectContaining({
        captionText: 'Brown attacks early and keeps pressure on the defense.',
      }),
    );
    expect(mocks.revokeObjectUrl).toHaveBeenCalledWith('blob:first-preview');
  });

  it('rebuilds the image only after applying caption changes', async () => {
    mocks.createObjectUrl.mockReset();
    mocks.createObjectUrl.mockReturnValueOnce('blob:first-preview');
    mocks.createObjectUrl.mockReturnValueOnce('blob:caption-preview');

    const { result } = renderHook(() => usePlayExportController(buildProps()));

    await act(async () => {
      await result.current.handleExportImage();
    });
    expect(mocks.renderExportCanvas).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.handleCaptionChange('Custom overlay caption');
    });
    expect(mocks.renderExportCanvas).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.handleApplyCaption();
    });
    await waitFor(() => {
      expect(mocks.renderExportCanvas).toHaveBeenCalledTimes(2);
    });
    expect(mocks.renderExportCanvas).toHaveBeenLastCalledWith(
      expect.objectContaining({
        captionText: 'Custom overlay caption',
      }),
    );
    await waitFor(() => {
      expect(result.current.exportPreview?.url).toBe('blob:caption-preview');
    });
  });

  it('exposes exporting state while image generation is pending', async () => {
    let resolveBlob;
    mocks.canvasToBlob.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBlob = resolve;
        }),
    );

    const { result } = renderHook(() => usePlayExportController(buildProps()));

    let exportPromise;
    await act(async () => {
      exportPromise = result.current.handleExportImage();
    });

    await waitFor(() => {
      expect(result.current.isExporting).toBe(true);
    });

    await act(async () => {
      resolveBlob(new Blob(['png'], { type: 'image/png' }));
      await exportPromise;
    });

    expect(result.current.isExporting).toBe(false);
    expect(result.current.exportPreview?.url).toBe('blob:preview-url');
  });

  it('surfaces errors and supports retry to a successful preview', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { result } = renderHook(() => usePlayExportController(buildProps()));

      mocks.renderExportCanvas.mockReturnValueOnce(null);

      await act(async () => {
        await result.current.handleExportImage();
      });

      expect(errorSpy).toHaveBeenCalled();
      expect(result.current.exportError).toContain('unable to build image');
      expect(result.current.exportPreview).toBeNull();

      await act(async () => {
        await result.current.handleExportImage();
      });

      expect(result.current.exportError).toBeNull();
      expect(result.current.exportPreview?.url).toBe('blob:preview-url');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('shares preview from the share-capable branch and closes modal on success', async () => {
    mocks.detectShareSupport.mockReturnValue({ canShareFiles: true, errorMessage: null });
    const { result } = renderHook(() => usePlayExportController(buildProps()));

    await act(async () => {
      await result.current.handleExportImage();
    });

    expect(result.current.exportPreview?.canShare).toBe(true);
    act(() => {
      result.current.handleCaptionChange('Custom share caption');
    });
    await act(async () => {
      result.current.handleApplyCaption();
    });

    await act(async () => {
      await result.current.handleSharePreview();
    });

    expect(mocks.shareFile).toHaveBeenCalledTimes(1);
    expect(mocks.shareFile).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Custom share caption',
      }),
    );
    expect(result.current.exportPreview).toBeNull();
  });

  it('falls back to data URL blob creation when canvasToBlob returns null', async () => {
    mocks.canvasToBlob.mockResolvedValue(null);
    mocks.renderExportCanvas.mockReturnValue({
      toDataURL: () => 'data:image/png;base64,SGVsbG8=',
    });

    const { result } = renderHook(() => usePlayExportController(buildProps()));

    await act(async () => {
      await result.current.handleExportImage();
    });

    expect(mocks.createObjectUrl).toHaveBeenCalledTimes(1);
    expect(result.current.exportPreview?.url).toBe('blob:preview-url');
    expect(result.current.exportError).toBeNull();
  });

  it('surfaces timeout errors from long-running blob conversion', async () => {
    vi.useFakeTimers();
    mocks.canvasToBlob.mockImplementation(
      () =>
        new Promise(() => {
          // Never resolves; withTimeout should reject.
        }),
    );

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { result } = renderHook(() => usePlayExportController(buildProps()));
      let exportPromise;

      await act(async () => {
        exportPromise = result.current.handleExportImage();
      });

      await act(async () => {
        vi.advanceTimersByTime(15000);
        await exportPromise;
      });

      expect(errorSpy).toHaveBeenCalled();
      expect(result.current.exportError).toContain('timed out');
      expect(result.current.isExporting).toBe(false);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('ignores stale request completion after unmount', async () => {
    let resolveBlob;
    mocks.canvasToBlob.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBlob = resolve;
        }),
    );

    const { result, unmount } = renderHook(() => usePlayExportController(buildProps()));
    let exportPromise;

    await act(async () => {
      exportPromise = result.current.handleExportImage();
    });

    unmount();

    await act(async () => {
      resolveBlob(new Blob(['late'], { type: 'image/png' }));
      await exportPromise;
    });

    expect(mocks.createObjectUrl).not.toHaveBeenCalled();
  });
});
