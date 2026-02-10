import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildExportRangeData, buildRangeLabel } from './playExportRange';
import { useExportRange } from './useExportRange';
import {
  buildExportDimensions,
  buildExportPlayerOptions,
  buildExportPreviewKey,
  buildExportRangeOptions,
  buildPlayExportFileName,
  buildShareMetadata,
  DEFAULT_EXPORT_VIEW,
  EXPORT_VIEW_OPTIONS,
  resolveFullNameFromRoster,
} from './playExportModel';
import { renderExportCanvas } from './playExportRenderer';
import {
  canvasToBlob,
  createObjectUrl,
  createPngFile,
  dataUrlToBlob,
  detectShareSupport,
  downloadBlob,
  revokeObjectUrl,
  shareFile,
  withTimeout,
} from './playExportTransport';
import { trackFeatureUse } from '../../../helpers/analytics';

const QUARTER_VIEW_BREAKPOINT = 700;
const EXPORT_TIMEOUT_MS = 15000;

export const usePlayExportController = ({
  playRef,
  gameId,
  gameStatus,
  gameDate,
  box,
  hasDisplayData,
  isDataLoading,
  isFinal,
  numPeriods,
  timelineWindow,
  leftMargin,
  rightMargin,
  showScoreDiff,
  statOn,
  teamColors,
  awayColor,
  homeColor,
  displayAwayTeamNames,
  displayHomeTeamNames,
  displayAwayPlayers,
  displayAwayPlayersAll,
  displayHomePlayers,
  displayHomePlayersAll,
  displayAwayPlayerTimeline,
  displayHomePlayerTimeline,
  displayScoreTimeline,
  displayLastAction,
  onExportInteractionStart,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportPreview, setExportPreview] = useState(null);
  const [exportError, setExportError] = useState(null);
  const [exportView, setExportView] = useState(DEFAULT_EXPORT_VIEW);
  const [exportPlayerKey, setExportPlayerKey] = useState('');

  const exportPreviewUrlRef = useRef(null);
  const exportPreviewKeyRef = useRef('1-1');
  const imageBuilderTrackedRef = useRef(false);
  const activeRequestIdRef = useRef(0);

  const { resolvedExportRange, handleExportRangeStartChange, handleExportRangeEndChange } =
    useExportRange({ gameId, numPeriods });

  const setExportPreviewState = useCallback((next) => {
    setExportPreview((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      const nextUrl = resolved?.url || null;
      if (exportPreviewUrlRef.current && exportPreviewUrlRef.current !== nextUrl) {
        revokeObjectUrl(exportPreviewUrlRef.current);
      }
      exportPreviewUrlRef.current = nextUrl;
      return resolved;
    });
  }, []);

  useEffect(
    () => () => {
      activeRequestIdRef.current += 1;
      if (exportPreviewUrlRef.current) {
        revokeObjectUrl(exportPreviewUrlRef.current);
      }
    },
    [],
  );

  const exportPlayerOptions = useMemo(
    () =>
      buildExportPlayerOptions({
        displayAwayPlayers,
        displayHomePlayers,
        displayAwayTeamNames,
        displayHomeTeamNames,
      }),
    [displayAwayPlayers, displayHomePlayers, displayAwayTeamNames, displayHomeTeamNames],
  );

  const selectedExportPlayer = useMemo(
    () => exportPlayerOptions.find((option) => option.key === exportPlayerKey) || null,
    [exportPlayerOptions, exportPlayerKey],
  );

  const exportPlayerDisplayName = useMemo(() => {
    if (!selectedExportPlayer?.name) return '';
    const teamKey = selectedExportPlayer?.teamKey === 'away' ? 'away' : 'home';
    const rosterPlayers = box?.teams?.[teamKey]?.players || [];
    return (
      resolveFullNameFromRoster(selectedExportPlayer.name, rosterPlayers) ||
      selectedExportPlayer.name
    );
  }, [selectedExportPlayer, box]);

  useEffect(() => {
    if (!exportPlayerOptions.length) {
      if (exportPlayerKey) {
        setExportPlayerKey('');
      }
      return;
    }
    if (!exportPlayerOptions.some((option) => option.key === exportPlayerKey)) {
      setExportPlayerKey(exportPlayerOptions[0].key);
    }
  }, [exportPlayerOptions, exportPlayerKey]);

  useEffect(() => {
    setExportPreviewState(null);
    setExportError(null);
    setExportView(DEFAULT_EXPORT_VIEW);
    setExportPlayerKey('');
  }, [gameId, setExportPreviewState]);

  const exportPreviewKey = useMemo(
    () =>
      buildExportPreviewKey({
        exportRange: resolvedExportRange,
        exportView,
        exportPlayerKey,
      }),
    [resolvedExportRange, exportView, exportPlayerKey],
  );

  const handleExportImage = useCallback(
    async ({ keepPreviewOpen = false } = {}) => {
      if (!playRef?.current || isExporting) return;
      if (typeof window === 'undefined' || typeof document === 'undefined') return;

      const requestId = activeRequestIdRef.current + 1;
      activeRequestIdRef.current = requestId;
      const isCurrentRequest = () => activeRequestIdRef.current === requestId;

      if (!keepPreviewOpen && !imageBuilderTrackedRef.current) {
        imageBuilderTrackedRef.current = true;
        trackFeatureUse('image-builder');
      }

      setIsExporting(true);
      setExportPreviewState((prev) => {
        if (!keepPreviewOpen) return null;
        if (!prev) return prev;
        return { ...prev, isUpdating: true };
      });
      setExportError(null);

      const isMobileViewport = Boolean(
        window.matchMedia && window.matchMedia(`(max-width: ${QUARTER_VIEW_BREAKPOINT}px)`).matches,
      );
      const exportTimeoutMs = isMobileViewport ? 30000 : EXPORT_TIMEOUT_MS;

      const exportRangeSnapshot = resolvedExportRange;
      exportPreviewKeyRef.current = buildExportPreviewKey({
        exportRange: exportRangeSnapshot,
        exportView,
        exportPlayerKey,
      });
      const exportIsFullGameRange = exportRangeSnapshot.isFullGame;
      const exportRangeLabel = buildRangeLabel(exportRangeSnapshot);
      const legendShouldWrap = exportView === 'player-stacked' ? true : !exportIsFullGameRange;
      const endAtLastScore = !isFinal;

      try {
        onExportInteractionStart?.();

        const {
          durationRatio,
          exportAwayPlayers,
          exportAwayPlayerTimeline,
          exportEndAtSeconds,
          exportHomePlayers,
          exportHomePlayerTimeline,
          exportScoreStats,
          exportScoreTimeline,
          exportStartScoreDiff,
          exportStatusLabel,
          exportTimelineWindow,
        } = buildExportRangeData({
          displayAwayPlayers,
          displayAwayPlayerTimeline,
          displayHomePlayers,
          displayHomePlayerTimeline,
          displayLastAction,
          displayScoreTimeline,
          exportRangeSnapshot,
          gameStatus,
          isFinal,
          numPeriods,
          timelineWindow,
        });
        const { exportAwayPlayers: exportAwayPlayersAll, exportHomePlayers: exportHomePlayersAll } =
          buildExportRangeData({
            displayAwayPlayers: displayAwayPlayersAll || displayAwayPlayers,
            displayAwayPlayerTimeline,
            displayHomePlayers: displayHomePlayersAll || displayHomePlayers,
            displayHomePlayerTimeline,
            displayLastAction,
            displayScoreTimeline,
            exportRangeSnapshot,
            gameStatus,
            isFinal,
            numPeriods,
            timelineWindow,
          });
        const { exportWidth } = buildExportDimensions({
          exportView,
          isFullGameRange: exportIsFullGameRange,
          durationRatio,
        });

        const outputCanvas = renderExportCanvas({
          exportView,
          selectedPlayer: selectedExportPlayer,
          playerDisplayName: exportPlayerDisplayName,
          exportWidth,
          legendShouldWrap,
          rangeLabel: exportRangeLabel,
          periodRange: exportRangeSnapshot,
          leftMargin,
          rightMargin,
          playRef,
          gameDate,
          displayAwayTeamNames,
          displayHomeTeamNames,
          filteredAwayPlayers: exportAwayPlayers,
          filteredHomePlayers: exportHomePlayers,
          boxScoreAwayPlayers: exportAwayPlayersAll,
          boxScoreHomePlayers: exportHomePlayersAll,
          filteredAwayPlayerTimeline: exportAwayPlayerTimeline,
          filteredHomePlayerTimeline: exportHomePlayerTimeline,
          filteredScoreTimeline: exportScoreTimeline,
          displayScoreTimeline,
          statusLabel: exportStatusLabel,
          endAtLastScore,
          endAtSeconds: exportEndAtSeconds,
          startScoreDiff: exportStartScoreDiff,
          timelineWindow: exportTimelineWindow,
          maxY: exportScoreStats.maxY,
          maxLead: exportScoreStats.maxLead,
          showScoreDiff: exportView !== 'full' ? false : showScoreDiff,
          statOn,
          teamColors,
          awayColor,
          homeColor,
        });

        if (!outputCanvas) {
          throw new Error('Export failed: unable to build image.');
        }

        let blob = await withTimeout(
          canvasToBlob(outputCanvas),
          exportTimeoutMs,
          'Play export image',
        );
        if (!blob && outputCanvas.toDataURL) {
          blob = dataUrlToBlob(outputCanvas.toDataURL('image/png'));
        }
        if (!blob) {
          throw new Error('Export failed: image blob was empty.');
        }
        if (!isCurrentRequest()) {
          return;
        }

        const fileName = buildPlayExportFileName({
          awayTeamNames: displayAwayTeamNames,
          homeTeamNames: displayHomeTeamNames,
          rangeLabel: exportRangeLabel,
          isFullGameRange: exportIsFullGameRange,
          gameId,
        });
        const { file, errorMessage: fileError } = createPngFile({ blob, fileName });
        if (fileError && isCurrentRequest()) {
          setExportError(fileError);
        }
        const { canShareFiles, errorMessage: shareError } = detectShareSupport({ file });
        if (shareError && isCurrentRequest()) {
          setExportError(shareError);
        }

        const origin = window.location?.origin || '';
        const {
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        } = buildShareMetadata({
          awayTeamNames: displayAwayTeamNames,
          homeTeamNames: displayHomeTeamNames,
          rangeLabel: exportRangeLabel,
          gameId,
          origin,
        });

        const shouldShowPreview = true;
        if (shouldShowPreview) {
          const url = createObjectUrl(blob);
          if (!url) {
            throw new Error('Export failed: unable to build preview URL.');
          }
          if (!isCurrentRequest()) {
            revokeObjectUrl(url);
            return;
          }
          setExportPreviewState({
            url,
            fileName,
            file,
            canShare: canShareFiles,
            shareTitle,
            shareText,
            shareUrl,
            isUpdating: false,
          });
          return;
        }

        let shared = false;
        if (canShareFiles && file) {
          const shareResult = await shareFile({
            file,
            title: shareTitle,
            text: shareText,
            url: shareUrl,
          });
          shared = shareResult.shared;
          if (shareResult.error && !shareResult.aborted) {
            console.error('Play export share failed.', shareResult.error);
          }
        }

        if (!shared) {
          downloadBlob({ blob, fileName });
        }
      } catch (err) {
        if (!isCurrentRequest()) return;
        const message = err?.message || 'Play export failed.';
        console.error('Play export failed.', err);
        setExportError(message);
      } finally {
        if (!isCurrentRequest()) return;
        if (keepPreviewOpen) {
          setExportPreviewState((prev) => (prev ? { ...prev, isUpdating: false } : prev));
        }
        setIsExporting(false);
      }
    },
    [
      playRef,
      isExporting,
      resolvedExportRange,
      exportView,
      exportPlayerKey,
      isFinal,
      onExportInteractionStart,
      displayAwayPlayers,
      displayAwayPlayerTimeline,
      displayHomePlayers,
      displayHomePlayerTimeline,
      displayLastAction,
      displayScoreTimeline,
      gameStatus,
      numPeriods,
      timelineWindow,
      displayAwayPlayersAll,
      displayHomePlayersAll,
      selectedExportPlayer,
      exportPlayerDisplayName,
      leftMargin,
      rightMargin,
      gameDate,
      displayAwayTeamNames,
      displayHomeTeamNames,
      showScoreDiff,
      statOn,
      teamColors,
      awayColor,
      homeColor,
      gameId,
      setExportPreviewState,
    ],
  );

  const handleSharePreview = useCallback(async () => {
    if (!exportPreview?.file || !exportPreview?.canShare) return;
    const shareResult = await shareFile({
      file: exportPreview.file,
      title: exportPreview.shareTitle,
      text: exportPreview.shareText,
      url: exportPreview.shareUrl,
    });
    if (shareResult.shared) {
      setExportPreviewState(null);
      return;
    }
    if (shareResult.error && !shareResult.aborted) {
      console.error('Play export share failed.', shareResult.error);
    }
  }, [exportPreview, setExportPreviewState]);

  useEffect(() => {
    if (!exportPreview) return;
    if (exportPreviewKeyRef.current === exportPreviewKey) return;
    exportPreviewKeyRef.current = exportPreviewKey;
    handleExportImage({ keepPreviewOpen: true });
  }, [exportPreview, exportPreviewKey, handleExportImage]);

  const exportRangeOptions = useMemo(() => buildExportRangeOptions(numPeriods), [numPeriods]);
  const filteredRangeEndOptions = exportRangeOptions.filter(
    (option) => option.period >= resolvedExportRange.start,
  );

  const closeExportPreview = useCallback(() => {
    setExportPreviewState(null);
  }, [setExportPreviewState]);

  const clearExportError = useCallback(() => {
    setExportError(null);
  }, []);

  const exportDisabled = !hasDisplayData || isDataLoading || isExporting;

  return {
    isExporting,
    exportPreview,
    exportError,
    exportView,
    exportPlayerKey,
    exportViewOptions: EXPORT_VIEW_OPTIONS,
    exportPlayerOptions,
    resolvedExportRange,
    exportRangeOptions,
    filteredRangeEndOptions,
    previewIsUpdating: Boolean(exportPreview?.isUpdating),
    exportDisabled,
    setExportView,
    setExportPlayerKey,
    handleExportRangeStartChange,
    handleExportRangeEndChange,
    handleExportImage,
    handleSharePreview,
    closeExportPreview,
    clearExportError,
  };
};
