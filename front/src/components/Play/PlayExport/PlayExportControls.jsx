import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildPlayExportCanvas,
  buildPlayExportFileName,
  canvasToBlob,
  dataUrlToBlob,
  DESKTOP_EXPORT_WIDTH,
  MOBILE_EXPORT_MAX_WIDTH,
} from './playExport';
import { buildExportRangeData, buildRangeLabel, formatPeriodLabel } from './playExportRange';
import { useExportRange } from './useExportRange';
import { trackFeatureUse } from '../../../helpers/analytics';

const QUARTER_VIEW_BREAKPOINT = 700;
const EXPORT_TIMEOUT_MS = 15000;

const withTimeout = (promise, ms, label) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

const resolveTeamLabel = (team) => {
  if (!team) return null;
  return team.name || team.abr || null;
};

const buildShareTitle = ({ awayTeamNames, homeTeamNames, rangeLabel }) => {
  const away = resolveTeamLabel(awayTeamNames);
  const home = resolveTeamLabel(homeTeamNames);
  const matchup = away && home ? `${away} vs ${home}` : 'Play-by-play chart';
  const rangeSuffix = rangeLabel ? ` (${rangeLabel})` : '';
  return `${matchup}${rangeSuffix}`;
};

const buildShareText = ({ awayTeamNames, homeTeamNames, rangeLabel }) => {
  const away = resolveTeamLabel(awayTeamNames);
  const home = resolveTeamLabel(homeTeamNames);
  const matchup = away && home ? `${away} vs ${home}` : null;
  if (matchup && rangeLabel) {
    return `Play-by-play chart for ${matchup} (${rangeLabel}).`;
  }
  if (matchup) {
    return `Play-by-play chart for ${matchup}.`;
  }
  return rangeLabel ? `Play-by-play chart (${rangeLabel}).` : 'Play-by-play chart.';
};

const buildGameShareUrl = (gameId) => {
  if (typeof window === 'undefined') return null;
  const trimmed = String(gameId || '').trim();
  if (!trimmed) return null;
  const origin = window.location?.origin || '';
  const pathname = `/${encodeURIComponent(trimmed)}`;
  return origin ? `${origin}${pathname}` : pathname;
};

const buildSharePayload = ({ file, title, text, url }) => {
  const payload = { files: [file] };
  if (title) payload.title = title;
  if (text) payload.text = text;
  if (url) payload.url = url;
  return payload;
};

const normalizeNameToken = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z\s'.-]/g, '')
    .trim();

const resolveFullNameFromRoster = (rawName, rosterPlayers) => {
  const cleaned = String(rawName || '').trim();
  if (!cleaned) return '';
  const normalized = normalizeNameToken(cleaned);
  if (!normalized) return cleaned;

  const roster = (rosterPlayers || [])
    .map((player) => {
      const first = String(player?.first || '').trim();
      const last = String(player?.last || '').trim();
      const full = [first, last].filter(Boolean).join(' ').trim();
      if (!full) return null;
      return {
        first,
        last,
        full,
        firstNorm: normalizeNameToken(first),
        lastNorm: normalizeNameToken(last),
        fullNorm: normalizeNameToken(full),
      };
    })
    .filter(Boolean);

  if (!roster.length) return cleaned;

  const direct = roster.find((player) => player.fullNorm === normalized);
  if (direct) return direct.full;

  const rawTokens = cleaned.split(/\s+/).filter(Boolean);
  const tokens = rawTokens.map(normalizeNameToken).filter(Boolean);
  if (!tokens.length) return cleaned;

  const firstTokenRaw = rawTokens[0] || '';
  const firstTokenNorm = tokens[0] || '';
  const lastTokenNorm = tokens[tokens.length - 1] || '';
  const firstLooksInitial = firstTokenRaw.replace(/\./g, '').length === 1;

  const candidates = roster.filter(
    (player) =>
      player.lastNorm === lastTokenNorm ||
      player.lastNorm.endsWith(` ${lastTokenNorm}`) ||
      player.lastNorm.endsWith(lastTokenNorm),
  );

  if (candidates.length === 1) {
    return candidates[0].full;
  }

  if (firstLooksInitial && firstTokenNorm) {
    const initialMatches = candidates.filter((player) =>
      player.firstNorm.startsWith(firstTokenNorm),
    );
    if (initialMatches.length === 1) {
      return initialMatches[0].full;
    }
  }

  if (!firstLooksInitial && tokens.length >= 2) {
    const fullMatches = candidates.filter((player) => player.firstNorm.startsWith(firstTokenNorm));
    if (fullMatches.length === 1) {
      return fullMatches[0].full;
    }
  }

  return cleaned;
};

export default function PlayExportControls({
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
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportPreview, setExportPreview] = useState(null);
  const [exportError, setExportError] = useState(null);
  const [exportView, setExportView] = useState('full');
  const [exportPlayerKey, setExportPlayerKey] = useState('');
  const exportPreviewUrlRef = useRef(null);
  const exportPreviewKeyRef = useRef('1-1');
  const exportPreviewRef = useRef(null);
  const imageBuilderTrackedRef = useRef(false);

  const trackImageBuilderUse = () => {
    if (imageBuilderTrackedRef.current) return;
    imageBuilderTrackedRef.current = true;
    trackFeatureUse('image-builder');
  };

  const setExportPreviewState = (next) => {
    setExportPreview((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      const nextUrl = resolved?.url || null;
      if (
        exportPreviewUrlRef.current &&
        exportPreviewUrlRef.current !== nextUrl &&
        typeof URL !== 'undefined'
      ) {
        URL.revokeObjectURL(exportPreviewUrlRef.current);
      }
      exportPreviewUrlRef.current = nextUrl;
      return resolved;
    });
  };

  useEffect(
    () => () => {
      if (exportPreviewUrlRef.current && typeof URL !== 'undefined') {
        URL.revokeObjectURL(exportPreviewUrlRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!exportPreview) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setExportPreviewState(null);
      }
    };
    const handlePointerDown = (event) => {
      if (!exportPreviewRef.current) return;
      if (!exportPreviewRef.current.contains(event.target)) {
        setExportPreviewState(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [exportPreview]);

  const { resolvedExportRange, handleExportRangeStartChange, handleExportRangeEndChange } =
    useExportRange({ gameId, numPeriods });

  const exportRangeKey = `${resolvedExportRange.start}-${resolvedExportRange.end}`;
  const exportPreviewKey =
    exportView !== 'full'
      ? `${exportRangeKey}|${exportView}|${exportPlayerKey}`
      : `${exportRangeKey}|${exportView}`;

  const exportViewOptions = useMemo(
    () => [
      { value: 'full', label: 'Full Timeline' },
      { value: 'player-stacked', label: 'Single Player Stacked' },
      { value: 'player', label: 'Single Player' },
    ],
    [],
  );

  const exportPlayerOptions = useMemo(() => {
    const buildTeamOptions = (players, teamKey, teamNames) => {
      const teamAbr = teamNames?.abr || (teamKey === 'away' ? 'Away' : 'Home');
      return Object.keys(players || {}).map((name) => ({
        key: `${teamKey}:${name}`,
        name,
        teamKey,
        teamLabel: teamNames?.name || teamAbr,
        teamAbr,
        label: `${name} (${teamAbr})`,
      }));
    };

    return [
      ...buildTeamOptions(displayAwayPlayers, 'away', displayAwayTeamNames),
      ...buildTeamOptions(displayHomePlayers, 'home', displayHomeTeamNames),
    ];
  }, [displayAwayPlayers, displayHomePlayers, displayAwayTeamNames, displayHomeTeamNames]);

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
    setExportView('full');
    setExportPlayerKey('');
  }, [gameId]);

  const handleExportImage = async ({ keepPreviewOpen = false } = {}) => {
    if (!playRef.current || isExporting) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!keepPreviewOpen) {
      trackImageBuilderUse();
    }
    setIsExporting(true);
    setExportPreviewState((prev) => {
      if (!keepPreviewOpen) return null;
      if (!prev) return prev;
      return { ...prev, isUpdating: true };
    });
    setExportError(null);
    const isMobileViewport = Boolean(
      typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia(`(max-width: ${QUARTER_VIEW_BREAKPOINT}px)`).matches,
    );
    const shouldShowPreview = true;
    const exportTimeoutMs = isMobileViewport ? 30000 : EXPORT_TIMEOUT_MS;
    const exportRangeSnapshot = resolvedExportRange;
    exportPreviewKeyRef.current =
      exportView !== 'full'
        ? `${exportRangeSnapshot.start}-${exportRangeSnapshot.end}|${exportView}|${exportPlayerKey}`
        : `${exportRangeSnapshot.start}-${exportRangeSnapshot.end}|${exportView}`;
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
      const scaledWidth = DESKTOP_EXPORT_WIDTH * durationRatio;
      const stackedWidth = Math.min(360, MOBILE_EXPORT_MAX_WIDTH, DESKTOP_EXPORT_WIDTH);
      const dataExportWidth =
        exportView === 'player-stacked'
          ? stackedWidth
          : exportIsFullGameRange
            ? DESKTOP_EXPORT_WIDTH
            : Math.max(360, Math.min(MOBILE_EXPORT_MAX_WIDTH, scaledWidth));

      const outputCanvas = buildPlayExportCanvas({
        exportView,
        selectedPlayer: selectedExportPlayer,
        playerDisplayName: exportPlayerDisplayName,
        exportWidth: dataExportWidth,
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

      const fileName = buildPlayExportFileName({
        awayTeamNames: displayAwayTeamNames,
        homeTeamNames: displayHomeTeamNames,
        rangeLabel: exportRangeLabel,
        isFullGameRange: exportIsFullGameRange,
        gameId,
      });
      let file = null;
      try {
        file = new File([blob], fileName, { type: 'image/png' });
      } catch (err) {
        setExportError('Share unavailable: File constructor failed on this device.');
      }
      let canShareFiles = false;
      if (file && typeof navigator !== 'undefined' && navigator.share) {
        if (!navigator.canShare) {
          canShareFiles = true;
        } else {
          try {
            canShareFiles = navigator.canShare({ files: [file] });
          } catch (err) {
            canShareFiles = false;
            setExportError('Share unavailable: browser rejected file sharing.');
          }
        }
      }

      const shareTitle = buildShareTitle({
        awayTeamNames: displayAwayTeamNames,
        homeTeamNames: displayHomeTeamNames,
        rangeLabel: exportRangeLabel,
      });
      const shareText = buildShareText({
        awayTeamNames: displayAwayTeamNames,
        homeTeamNames: displayHomeTeamNames,
        rangeLabel: exportRangeLabel,
      });
      const shareUrl = buildGameShareUrl(gameId);

      if (shouldShowPreview) {
        const url = URL.createObjectURL(blob);
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

      if (typeof navigator !== 'undefined' && navigator.share) {
        if (canShareFiles) {
          try {
            await navigator.share(
              buildSharePayload({
                file,
                title: shareTitle,
                text: shareText,
                url: shareUrl,
              }),
            );
            shared = true;
          } catch (err) {
            if (err?.name !== 'AbortError') {
              console.error('Play export share failed.', err);
            }
          }
        }
      }

      if (!shared) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 15000);
      }
    } catch (err) {
      const message = err?.message || 'Play export failed.';
      console.error('Play export failed.', err);
      setExportError(message);
    } finally {
      if (keepPreviewOpen) {
        setExportPreviewState((prev) => (prev ? { ...prev, isUpdating: false } : prev));
      }
      setIsExporting(false);
    }
  };

  const handleSharePreview = async () => {
    if (!exportPreview?.file || !exportPreview?.canShare) return;
    if (typeof navigator === 'undefined' || !navigator.share) return;
    try {
      await navigator.share(
        buildSharePayload({
          file: exportPreview.file,
          title: exportPreview.shareTitle,
          text: exportPreview.shareText,
          url: exportPreview.shareUrl,
        }),
      );
      setExportPreviewState(null);
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('Play export share failed.', err);
      }
    }
  };

  useEffect(() => {
    if (!exportPreview) return;
    if (exportPreviewKeyRef.current === exportPreviewKey) return;
    exportPreviewKeyRef.current = exportPreviewKey;
    handleExportImage({ keepPreviewOpen: true });
  }, [exportPreview, exportPreviewKey]);

  const exportDisabled = !hasDisplayData || isDataLoading || isExporting;

  const exportRangeOptions = useMemo(() => {
    if (numPeriods <= 0) return [];
    const options = [];
    for (let i = 0; i < numPeriods; i += 1) {
      const period = i + 1;
      options.push({
        period,
        label: formatPeriodLabel(period),
      });
    }
    return options;
  }, [numPeriods]);

  const filteredRangeEndOptions = exportRangeOptions.filter(
    (option) => option.period >= resolvedExportRange.start,
  );

  const previewIsUpdating = Boolean(exportPreview?.isUpdating);

  return (
    <>
      {hasDisplayData && (
        <button
          type="button"
          className="playExportButton"
          onClick={handleExportImage}
          disabled={exportDisabled}
          aria-label={isExporting ? 'Preparing image export' : 'Export image'}
          title={isExporting ? 'Preparing image...' : 'Export image'}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v12" />
            <path d="M8 7l4-4 4 4" />
            <path d="M4 14v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" />
          </svg>
        </button>
      )}

      {exportError && (
        <div className="playExportError" role="status" aria-live="polite">
          <span>{exportError}</span>
          <button
            type="button"
            className="playExportErrorDismiss"
            onClick={() => setExportError(null)}
            aria-label="Dismiss export error"
          >
            Dismiss
          </button>
        </div>
      )}

      {exportPreview && (
        <div
          className="playExportPreview"
          role="dialog"
          aria-label="Play-by-play image preview"
          ref={exportPreviewRef}
        >
          <div className="playExportPreviewHeader">
            <span>Image Builder</span>
            <button
              type="button"
              className="playExportPreviewClose"
              onClick={() => setExportPreviewState(null)}
              aria-label="Close image preview"
            >
              Close
            </button>
          </div>
          <div className="playExportPreviewOptions">
            <label className="playExportOption">
              <span>View</span>
              <select
                value={exportView}
                onChange={(event) => setExportView(event.target.value)}
                disabled={isExporting || previewIsUpdating}
              >
                {exportViewOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="playExportOption">
              <span>Player</span>
              <select
                value={exportPlayerKey}
                onChange={(event) => setExportPlayerKey(event.target.value)}
                disabled={
                  exportView === 'full' ||
                  isExporting ||
                  previewIsUpdating ||
                  !exportPlayerOptions.length
                }
              >
                {exportPlayerOptions.length ? (
                  exportPlayerOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>
                    No players
                  </option>
                )}
              </select>
            </label>
            {exportRangeOptions.length > 0 && (
              <div className="playExportRange">
                <label className="playExportOption">
                  <span>Start</span>
                  <select
                    value={resolvedExportRange.start}
                    onChange={handleExportRangeStartChange}
                    disabled={isExporting || previewIsUpdating}
                  >
                    {exportRangeOptions.map(({ period, label }) => (
                      <option key={period} value={period}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="playExportOption">
                  <span>End</span>
                  <select
                    value={resolvedExportRange.end}
                    onChange={handleExportRangeEndChange}
                    disabled={isExporting || previewIsUpdating}
                  >
                    {filteredRangeEndOptions.map(({ period, label }) => (
                      <option key={period} value={period}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
          <div className="playExportPreviewBody">
            <img src={exportPreview.url} alt="Play-by-play export preview" />
          </div>
          <div className="playExportPreviewActions">
            {exportPreview.canShare && (
              <button type="button" className="playExportActionButton" onClick={handleSharePreview}>
                Share
              </button>
            )}
            <a
              className="playExportActionButton isLink"
              href={exportPreview.url}
              target="_blank"
              rel="noopener"
            >
              Open image
            </a>
          </div>
        </div>
      )}
    </>
  );
}
