import { buildPlayExportFileName, buildShareMetadata } from '../playExportModel';

export const buildExportOutputMetadata = ({
  awayTeamNames,
  homeTeamNames,
  rangeLabel,
  isFullGameRange,
  gameId,
  origin,
}) => {
  const fileName = buildPlayExportFileName({
    awayTeamNames,
    homeTeamNames,
    rangeLabel,
    isFullGameRange,
    gameId,
  });

  const shareMetadata = buildShareMetadata({
    awayTeamNames,
    homeTeamNames,
    rangeLabel,
    gameId,
    origin,
  });

  return {
    fileName,
    shareMetadata,
  };
};

export const buildExportPreviewState = ({
  url,
  fileName,
  file,
  canShare,
  shareMetadata,
  isUpdating = false,
}) => ({
  url,
  fileName,
  file,
  canShare,
  shareTitle: shareMetadata.title,
  shareText: shareMetadata.text,
  shareUrl: shareMetadata.url,
  isUpdating,
});
