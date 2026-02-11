import { DESKTOP_EXPORT_WIDTH, MOBILE_EXPORT_MAX_WIDTH } from './playExportCore';
import { isValidExportView } from './playExportModel';
import { renderFullExportCanvas } from './render/renderFullExport';
import { renderLiteExportCanvas } from './render/renderLiteExport';
import { renderPlayerExportCanvas } from './render/renderPlayerExport';
import { renderPlayerStackedExportCanvas } from './render/renderPlayerStackedExport';

const assertRenderableInput = (input) => {
  if (!input) {
    throw new Error('Export failed: missing export input.');
  }
  if (!isValidExportView(input.exportView)) {
    throw new Error('Export failed: unsupported export view.');
  }
  if (input.exportView !== 'full' && !input.selectedPlayer?.name) {
    throw new Error('Export failed: player view requires a selected player.');
  }
  const start = Number(input.periodRange?.start);
  const end = Number(input.periodRange?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error('Export failed: invalid period range.');
  }
};

export const dispatchExportCanvas = (input) => {
  if (input?.exportView === 'player') {
    return renderPlayerExportCanvas(input);
  }
  if (input?.exportView === 'player-stacked') {
    return renderPlayerStackedExportCanvas(input);
  }
  return renderFullExportCanvas(input) || renderLiteExportCanvas(input);
};

export const renderExportCanvas = (input) => {
  assertRenderableInput(input);
  return dispatchExportCanvas(input);
};

export { DESKTOP_EXPORT_WIDTH, MOBILE_EXPORT_MAX_WIDTH };
