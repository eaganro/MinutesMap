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
  blob,
  file,
  canShare,
  shareMetadata,
  captionText = '',
  isUpdating = false,
}) => ({
  url,
  fileName,
  blob,
  file,
  canShare,
  captionText,
  shareTitle: shareMetadata.title,
  shareText: captionText || shareMetadata.text || '',
  shareUrl: shareMetadata.url,
  isUpdating,
});
