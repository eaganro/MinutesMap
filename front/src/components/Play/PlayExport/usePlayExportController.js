import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useExportRange } from './useExportRange';
import {
  buildExportPlayerOptions,
  buildExportPreviewKey,
  buildExportRangeOptions,
  DEFAULT_EXPORT_VIEW,
  EXPORT_VIEW_OPTIONS,
  resolveFullNameFromRoster,
} from './playExportModel';
import { formatPeriodLabel } from './playExportRange';
import { buildExportRequestSnapshot } from './model/exportRangeModel';
import { buildExportRenderRequest } from './model/exportRequestModel';
import { buildExportOutputMetadata, buildExportPreviewState } from './model/exportPreviewModel';
import {
  clampExportCaption,
  resolveDefaultExportCaption,
  resolveExportCaptionMaxLength,
  resolveFullCaptionPeriods,
  resolvePlayerCaptionPeriods,
} from './model/exportCaptionModel';
import { renderExportCanvas } from './playExportRenderer';
import { loadTeamLogosForExport } from './playExportAssets';
import {
  canvasToBlob,
  createObjectUrl,
  createPngFile,
  dataUrlToBlob,
  detectShareSupport,
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
  box,
  exportData,
  onExportInteractionStart,
}) => {
  const {
    stablePlayData,
    periodData,
    hasDisplayData,
    isDataLoading,
    isFinal,
    numPeriods,
    leftMargin,
    rightMargin,
    showScoreDiff,
    statOn,
    teamColors,
    awayColor,
    homeColor,
  } = exportData;
  const awayPlayerActions = stablePlayData.playerActions.away;
  const homePlayerActions = stablePlayData.playerActions.home;
  const gameDate = stablePlayData.gameDate;
  const displayAwayTeamNames = stablePlayData.awayTeamNames;
  const displayHomeTeamNames = stablePlayData.homeTeamNames;
  const displayAwayPlayers = awayPlayerActions.filtered;
  const displayAwayPlayersAll = awayPlayerActions.all;
  const displayHomePlayers = homePlayerActions.filtered;
  const displayHomePlayersAll = homePlayerActions.all;
  const displayAwayPlayerTimeline = stablePlayData.awayPlayerTimeline;
  const displayHomePlayerTimeline = stablePlayData.homePlayerTimeline;
  const displayScoreTimeline = stablePlayData.scoreTimeline;
  const displayLastAction = stablePlayData.lastAction;
  const generatedCaptions = stablePlayData.captions;
  const timelineWindow = periodData.timelineWindow;

  const [isExporting, setIsExporting] = useState(false);
  const [exportPreview, setExportPreview] = useState(null);
  const [exportError, setExportError] = useState(null);
  const [exportView, setExportView] = useState(DEFAULT_EXPORT_VIEW);
  const [exportPlayerKey, setExportPlayerKey] = useState('');
  const [captionDraft, setCaptionDraft] = useState('');

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

  const exportPlayerOptions = useMemo(() => {
    const rawOptions = buildExportPlayerOptions({
      displayAwayPlayers,
      displayHomePlayers,
      displayAwayTeamNames,
      displayHomeTeamNames,
    });

    const withCaptions = rawOptions.map((option, index) => {
      const teamKey = option.teamKey === 'away' ? 'away' : 'home';
      const rosterPlayers = box?.teams?.[teamKey]?.players || [];
      const displayName = resolveFullNameFromRoster(option.name, rosterPlayers) || option.name;
      const captionPeriods = resolvePlayerCaptionPeriods({
        captions: generatedCaptions,
        selectedPlayer: { name: option.name, teamKey: option.teamKey },
        playerDisplayName: displayName,
      });
      const captionPeriodLabels = captionPeriods.map((period) => formatPeriodLabel(period)).filter(Boolean);
      const hasAnyCaption = captionPeriodLabels.length > 0;
      const hasCaption = captionPeriods.includes(Number(resolvedExportRange?.end));
      return {
        ...option,
        hasCaption,
        hasAnyCaption,
        captionPeriods,
        label: hasAnyCaption
          ? `${option.name} (${option.teamAbr}) [${captionPeriodLabels.join(', ')}]`
          : option.label,
        sortIndex: index,
      };
    });

    withCaptions.sort((a, b) => {
      if (a.hasCaption !== b.hasCaption) {
        return a.hasCaption ? -1 : 1;
      }
      if (a.hasAnyCaption !== b.hasAnyCaption) {
        return a.hasAnyCaption ? -1 : 1;
      }
      return a.sortIndex - b.sortIndex;
    });

    return withCaptions.map(({ sortIndex: _sortIndex, ...option }) => option);
  }, [
    displayAwayPlayers,
    displayHomePlayers,
    displayAwayTeamNames,
    displayHomeTeamNames,
    box,
    generatedCaptions,
    resolvedExportRange,
  ]);

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
    const hasCurrent = exportPlayerOptions.some((option) => option.key === exportPlayerKey);
    if (!hasCurrent) {
      const preferredOption =
        exportPlayerOptions.find((option) => option.hasCaption) ||
        exportPlayerOptions.find((option) => option.hasAnyCaption);
      setExportPlayerKey((preferredOption || exportPlayerOptions[0]).key);
    }
  }, [exportPlayerOptions, exportPlayerKey]);

  useEffect(() => {
    setExportPreviewState(null);
    setExportError(null);
    setExportView(DEFAULT_EXPORT_VIEW);
    setExportPlayerKey('');
    setCaptionDraft('');
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
    async ({ keepPreviewOpen = false, captionOverride } = {}) => {
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

      const snapshot = buildExportRequestSnapshot({
        resolvedExportRange,
        exportView,
        exportPlayerKey,
        isFinal,
      });
      exportPreviewKeyRef.current = snapshot.exportPreviewKey;

      try {
        onExportInteractionStart?.();

        const defaultCaption = resolveDefaultExportCaption({
          captions: generatedCaptions,
          exportView,
          exportRange: snapshot.exportRangeSnapshot,
          selectedPlayer: selectedExportPlayer,
          playerDisplayName: exportPlayerDisplayName,
        });
        const resolvedCaption = clampExportCaption({
          text: typeof captionOverride === 'string' ? captionOverride : String(defaultCaption || ''),
          exportView,
          captions: generatedCaptions,
        });
        const teamLogos = await loadTeamLogosForExport({
          awayTeamAbbr: displayAwayTeamNames?.abr,
          homeTeamAbbr: displayHomeTeamNames?.abr,
        });

        const { renderInput, exportRangeLabel, exportIsFullGameRange } = buildExportRenderRequest({
          snapshot,
          exportView,
          selectedExportPlayer,
          exportPlayerDisplayName,
          captionText: resolvedCaption,
          teamLogos,
          leftMargin,
          rightMargin,
          playRef,
          gameDate,
          displayAwayTeamNames,
          displayHomeTeamNames,
          displayAwayPlayers,
          displayAwayPlayersAll,
          displayAwayPlayerTimeline,
          displayHomePlayers,
          displayHomePlayersAll,
          displayHomePlayerTimeline,
          displayLastAction,
          displayScoreTimeline,
          gameStatus,
          isFinal,
          numPeriods,
          timelineWindow,
          showScoreDiff,
          statOn,
          teamColors,
          awayColor,
          homeColor,
        });
        const outputCanvas = renderExportCanvas(renderInput);

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

        const { fileName, shareMetadata } = buildExportOutputMetadata({
          awayTeamNames: displayAwayTeamNames,
          homeTeamNames: displayHomeTeamNames,
          rangeLabel: exportRangeLabel,
          isFullGameRange: exportIsFullGameRange,
          gameId,
          origin: window.location?.origin || '',
        });
        const { file, errorMessage: fileError } = createPngFile({ blob, fileName });
        if (fileError && isCurrentRequest()) {
          setExportError(fileError);
        }
        const { canShareFiles, errorMessage: shareError } = detectShareSupport({ file });
        if (shareError && isCurrentRequest()) {
          setExportError(shareError);
        }

        const url = createObjectUrl(blob);
        if (!url) {
          throw new Error('Export failed: unable to build preview URL.');
        }
        if (!isCurrentRequest()) {
          revokeObjectUrl(url);
          return;
        }
        setExportPreviewState(
          buildExportPreviewState({
            url,
            fileName,
            file,
            canShare: canShareFiles,
            shareMetadata,
            captionText: resolvedCaption,
            isUpdating: false,
          }),
        );
        setCaptionDraft(resolvedCaption);
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
      displayAwayPlayersAll,
      displayAwayPlayerTimeline,
      displayHomePlayers,
      displayHomePlayersAll,
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
      generatedCaptions,
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
      text: (exportPreview.captionText || '').trim() || undefined,
      url: exportPreview.shareUrl,
    });
    if (shareResult.shared) {
      activeRequestIdRef.current += 1;
      setExportPreviewState(null);
      setCaptionDraft('');
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
  const captionedEndPeriods = useMemo(() => {
    if (exportView === 'full') {
      return new Set(resolveFullCaptionPeriods({ captions: generatedCaptions }));
    }
    return new Set(
      resolvePlayerCaptionPeriods({
        captions: generatedCaptions,
        selectedPlayer: selectedExportPlayer,
        playerDisplayName: exportPlayerDisplayName,
      }),
    );
  }, [exportView, generatedCaptions, selectedExportPlayer, exportPlayerDisplayName]);

  const filteredRangeEndOptions = useMemo(
    () =>
      exportRangeOptions
        .filter((option) => option.period >= resolvedExportRange.start)
        .map((option) =>
          captionedEndPeriods.has(option.period)
            ? { ...option, label: `${option.label} [caption]` }
            : option,
        ),
    [exportRangeOptions, resolvedExportRange.start, captionedEndPeriods],
  );

  const captionMaxLength = useMemo(
    () => resolveExportCaptionMaxLength({ exportView, captions: generatedCaptions }),
    [exportView, generatedCaptions],
  );

  useEffect(() => {
    setCaptionDraft((prev) => {
      const clamped = clampExportCaption({ text: prev, exportView, captions: generatedCaptions });
      return clamped === prev ? prev : clamped;
    });
  }, [exportView, generatedCaptions]);

  const closeExportPreview = useCallback(() => {
    activeRequestIdRef.current += 1;
    setExportPreviewState(null);
    setCaptionDraft('');
  }, [setExportPreviewState]);

  const clearExportError = useCallback(() => {
    setExportError(null);
  }, []);

  const handleCaptionChange = useCallback((nextCaption) => {
    const resolved = clampExportCaption({
      text: nextCaption,
      exportView,
      captions: generatedCaptions,
    });
    setCaptionDraft(resolved);
  }, [exportView, generatedCaptions]);

  const handleApplyCaption = useCallback(() => {
    if (!exportPreview) return;
    void handleExportImage({ keepPreviewOpen: true, captionOverride: captionDraft });
  }, [exportPreview, captionDraft, handleExportImage]);

  const captionCanApply =
    Boolean(exportPreview) && captionDraft !== (exportPreview?.captionText || '');

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
    captionText: captionDraft,
    captionMaxLength,
    captionCanApply,
    exportDisabled,
    setExportView,
    setExportPlayerKey,
    handleExportRangeStartChange,
    handleExportRangeEndChange,
    handleExportImage,
    handleSharePreview,
    closeExportPreview,
    clearExportError,
    handleCaptionChange,
    handleApplyCaption,
  };
};
