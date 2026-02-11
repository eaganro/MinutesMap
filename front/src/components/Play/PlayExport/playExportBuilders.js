import { renderFullExportCanvas } from './render/renderFullExport';
import { renderLiteExportCanvas } from './render/renderLiteExport';
import { renderPlayerExportCanvas } from './render/renderPlayerExport';
import { renderPlayerStackedExportCanvas } from './render/renderPlayerStackedExport';

export const buildPlayExportCanvas = (params) => {
  if (params?.exportView === 'player') {
    return renderPlayerExportCanvas(params);
  }
  if (params?.exportView === 'player-stacked') {
    return renderPlayerStackedExportCanvas(params);
  }
  return renderFullExportCanvas(params) || renderLiteExportCanvas(params);
};
