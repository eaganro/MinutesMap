import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlayExportControls from './PlayExportControls';

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
