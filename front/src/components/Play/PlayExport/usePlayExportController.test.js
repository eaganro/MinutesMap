import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  renderExportCanvas: vi.fn(),
  canvasToBlob: vi.fn(),
  createPngFile: vi.fn(),
  detectShareSupport: vi.fn(),
  createObjectUrl: vi.fn(),
  shareFile: vi.fn(),
  trackFeatureUse: vi.fn(),
}));

vi.mock('./playExportRenderer', () => ({
  renderExportCanvas: mocks.renderExportCanvas,
}));

vi.mock('./playExportTransport', async () => {
  const actual = await vi.importActual('./playExportTransport');
  return {
    ...actual,
    canvasToBlob: mocks.canvasToBlob,
    createPngFile: mocks.createPngFile,
    detectShareSupport: mocks.detectShareSupport,
    createObjectUrl: mocks.createObjectUrl,
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
  gameDate: '2026-02-03',
  box: {
    teams: {
      away: {
        players: [{ first: 'Jaylen', last: 'Brown' }],
      },
      home: { players: [] },
    },
  },
  hasDisplayData: true,
  isDataLoading: false,
  isFinal: false,
  numPeriods: 4,
  timelineWindow: { startSeconds: 0, durationSeconds: 2880 },
  leftMargin: 96,
  rightMargin: 10,
  showScoreDiff: true,
  statOn: 0,
  teamColors: { away: '#f00', home: '#00f' },
  awayColor: '#f00',
  homeColor: '#00f',
  displayAwayTeamNames: { abr: 'PHI', name: '76ers' },
  displayHomeTeamNames: { abr: 'GSW', name: 'Warriors' },
  displayAwayPlayers: {
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
  displayAwayPlayersAll: null,
  displayHomePlayers: {},
  displayHomePlayersAll: null,
  displayAwayPlayerTimeline: {
    'J. Brown': [{ period: 1, start: 'PT12M00.00S', end: 'PT00M00.00S' }],
  },
  displayHomePlayerTimeline: {},
  displayScoreTimeline: [
    { period: 1, clock: 'PT12M00.00S', away: 0, home: 0 },
    { period: 1, clock: 'PT10M00.00S', away: 2, home: 0 },
  ],
  displayLastAction: { period: 1, clock: 'PT10M00.00S' },
  onExportInteractionStart: vi.fn(),
});

describe('usePlayExportController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
    mocks.renderExportCanvas.mockReturnValue({
      toDataURL: () => 'data:image/png;base64,SGVsbG8=',
    });
    mocks.canvasToBlob.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    mocks.createPngFile.mockReturnValue({
      file: new File([new Blob(['png'])], 'export.png', { type: 'image/png' }),
      errorMessage: null,
    });
    mocks.detectShareSupport.mockReturnValue({ canShareFiles: false, errorMessage: null });
    mocks.createObjectUrl.mockReturnValue('blob:preview-url');
    mocks.shareFile.mockResolvedValue({ shared: true, aborted: false, error: null });
  });

  it('builds export preview state through renderer and transport', async () => {
    const props = buildProps();
    const { result } = renderHook(() => usePlayExportController(props));

    await act(async () => {
      await result.current.handleExportImage();
    });

    expect(props.onExportInteractionStart).toHaveBeenCalledTimes(1);
    expect(mocks.trackFeatureUse).toHaveBeenCalledWith('image-builder');
    expect(mocks.renderExportCanvas).toHaveBeenCalledTimes(1);
    expect(result.current.exportPreview?.url).toBe('blob:preview-url');
    expect(result.current.exportError).toBeNull();
  });

  it('auto-refreshes preview when export settings change', async () => {
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
  });
});
