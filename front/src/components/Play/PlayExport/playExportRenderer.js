import { buildPlayExportCanvas } from './playExportBuilders';
import { DESKTOP_EXPORT_WIDTH, MOBILE_EXPORT_MAX_WIDTH } from './playExportCore';
import { isValidExportView } from './playExportModel';

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

export const renderExportCanvas = (input) => {
  assertRenderableInput(input);
  return buildPlayExportCanvas(input);
};

export { DESKTOP_EXPORT_WIDTH, MOBILE_EXPORT_MAX_WIDTH };
