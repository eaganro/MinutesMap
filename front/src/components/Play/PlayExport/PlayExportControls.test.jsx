import { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlayExportControls from './PlayExportControls';
import { TIP_SHOW_DELAY_MS } from '../../tips/useTipSequence';

const mocks = vi.hoisted(() => ({
  controller: null,
}));

vi.mock('./usePlayExportController', () => ({
  usePlayExportController: () => mocks.controller,
}));

const buildController = (overrides = {}) => ({
  isExporting: false,
  exportPreview: null,
  exportError: null,
  exportView: 'full',
  exportPlayerKey: '',
  exportViewOptions: [{ value: 'full', label: 'Full game' }],
  exportPlayerOptions: [],
  resolvedExportRange: { start: 1, end: 1 },
  exportRangeOptions: [],
  filteredRangeEndOptions: [],
  hasCaptionedPeriods: false,
  previewIsUpdating: false,
  captionText: '',
  captionMaxLength: 280,
  captionCanApply: false,
  exportDisabled: false,
  setExportView: vi.fn(),
  setExportPlayerKey: vi.fn(),
  handleExportRangeStartChange: vi.fn(),
  handleExportRangeEndChange: vi.fn(),
  handleExportImage: vi.fn(),
  handleSharePreview: vi.fn(),
  handleDownloadPreview: vi.fn(),
  closeExportPreview: vi.fn(),
  clearExportError: vi.fn(),
  handleCaptionChange: vi.fn(),
  handleApplyCaption: vi.fn(),
  handleClearCaption: vi.fn(),
  ...overrides,
});

afterEach(() => {
  cleanup();
});

const renderControls = () =>
  render(
    <PlayExportControls
      playRef={createRef()}
      gameId="game-1"
      gameStatus="Final"
      box={{}}
      exportData={{ hasDisplayData: true, numPeriods: 4 }}
    />,
  );

describe('PlayExportControls accessibility', () => {
  beforeEach(() => {
    mocks.controller = buildController();
  });

  it('moves focus into the modal, traps it, closes on Escape, and restores the trigger', () => {
    const { rerender } = renderControls();
    const trigger = screen.getByRole('button', { name: 'Share image' });
    trigger.focus();

    mocks.controller = buildController({
      exportPreview: { url: 'blob:preview', canShare: false },
    });
    rerender(
      <PlayExportControls
        playRef={createRef()}
        gameId="game-1"
        gameStatus="Final"
        box={{}}
        exportData={{ hasDisplayData: true, numPeriods: 4 }}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Play-by-play image preview' });
    const closeButton = screen.getByRole('button', { name: 'Close image preview' });
    const downloadButton = screen.getByRole('button', { name: 'Download image' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(closeButton).toHaveFocus();

    downloadButton.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(downloadButton).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mocks.controller.closeExportPreview).toHaveBeenCalledTimes(1);

    mocks.controller = buildController();
    rerender(
      <PlayExportControls
        playRef={createRef()}
        gameId="game-1"
        gameStatus="Final"
        box={{}}
        exportData={{ hasDisplayData: true, numPeriods: 4 }}
      />,
    );
    expect(trigger).toHaveFocus();
  });
});

describe('PlayExportControls tips', () => {
  const periods = [
    { period: 1, label: 'Q1' },
    { period: 2, label: 'Q2' },
  ];

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    mocks.controller = buildController({
      exportPreview: { url: 'blob:preview', canShare: false },
      exportRangeOptions: periods,
      filteredRangeEndOptions: periods,
      hasCaptionedPeriods: true,
      captionCanApply: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const showTips = () => {
    act(() => {
      vi.advanceTimersByTime(TIP_SHOW_DELAY_MS);
    });
  };

  it('walks through view, range and caption as each control is used', () => {
    renderControls();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    showTips();
    expect(screen.getByText(/Pick a layout/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.getByText(/Choose which quarters/)).toHaveTextContent('[caption]');

    fireEvent.change(screen.getByRole('combobox', { name: 'Start' }), { target: { value: '2' } });
    expect(mocks.controller.handleExportRangeStartChange).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Edit the caption/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Update caption' }));
    expect(mocks.controller.handleApplyCaption).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('exportTips'))).toEqual({
      view: true,
      range: true,
      caption: true,
    });
  });

  it('leaves out the range tip when there are no quarters to pick', () => {
    mocks.controller = buildController({
      exportPreview: { url: 'blob:preview', canShare: false },
    });
    renderControls();
    showTips();

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText(/Choose which quarters/)).not.toBeInTheDocument();
    expect(screen.getByText(/Edit the caption/)).toBeInTheDocument();
  });

  it('stops for good when skipped', () => {
    const { unmount } = renderControls();
    showTips();
    fireEvent.click(screen.getByRole('button', { name: 'Skip tips' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    unmount();
    renderControls();
    showTips();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
