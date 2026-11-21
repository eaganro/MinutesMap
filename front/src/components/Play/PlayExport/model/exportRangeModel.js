import { buildExportPreviewKey } from '../playExportModel';
import { buildRangeLabel } from '../playExportRange';

export const buildExportRequestSnapshot = ({
  resolvedExportRange,
  exportView,
  exportPlayerKey,
  exportFocusKey = '',
  isFinal,
}) => {
  const exportRangeSnapshot = resolvedExportRange;
  const exportPreviewKey = buildExportPreviewKey({
    exportRange: exportRangeSnapshot,
    exportView,
    exportPlayerKey,
    exportFocusKey,
  });
  const exportIsFullGameRange = exportRangeSnapshot.isFullGame;
  const exportRangeLabel = buildRangeLabel(exportRangeSnapshot);
  const legendShouldWrap = exportView === 'player-stacked' ? true : !exportIsFullGameRange;
  const endAtLastScore = !isFinal;

  return {
    exportRangeSnapshot,
    exportPreviewKey,
    exportIsFullGameRange,
    exportRangeLabel,
    legendShouldWrap,
    endAtLastScore,
  };
};
