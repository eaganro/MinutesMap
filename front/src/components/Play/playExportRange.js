import { getGameTotalSeconds, getPeriodDurationSeconds, getPeriodStartSeconds, getSecondsElapsed } from '../../helpers/playTimeline';
import { formatClock, formatStatusText } from '../../helpers/utils';

export const formatPeriodLabel = (period) => {
  const value = Number(period);
  if (!Number.isFinite(value) || value <= 0) return '';
  return value <= 4 ? `Q${value}` : `O${value - 4}`;
};

export const normalizeExportRange = (range, totalPeriods) => {
  const total = Number(totalPeriods);
  if (!Number.isFinite(total) || total <= 0) {
    return { start: 1, end: 1, isFullGame: true };
  }
  let start = Number(range?.start);
  let end = Number(range?.end);
  if (!Number.isFinite(start) || start <= 0) start = 1;
  if (!Number.isFinite(end) || end <= 0) end = total;
  start = Math.min(total, Math.max(1, start));
  end = Math.min(total, Math.max(1, end));
  if (end < start) end = start;
  return { start, end, isFullGame: start === 1 && end === total };
};

export const buildRangeLabel = (range) => {
  if (!range || range.isFullGame) return '';
  if (range.start === range.end) return formatPeriodLabel(range.start);
  return `${formatPeriodLabel(range.start)}-${formatPeriodLabel(range.end)}`;
};

const formatClockLabel = (clock) => {
  if (clock === null || clock === undefined) return '';
  if (typeof clock === 'string' && clock.includes(':')) return clock;
  if (typeof clock === 'string') return formatClock(clock);
  return String(clock);
};

export const buildGameStatusLabel = ({
  lastAction,
  gameStatus,
  isFinal,
  isFullGameRange,
  periodRange,
  scoreTimeline,
}) => {
  if (isFinal && isFullGameRange) {
    const statusText = formatStatusText(gameStatus);
    return statusText || 'Final';
  }
  if (!isFullGameRange && Number.isFinite(periodRange?.end)) {
    const rangeLabel = formatPeriodLabel(periodRange.end);
    if (rangeLabel) {
      return `End ${rangeLabel}`;
    }
  }
  const lastScoreEntry = scoreTimeline?.length ? scoreTimeline[scoreTimeline.length - 1] : null;
  const period = lastScoreEntry?.period ?? lastAction?.period;
  const clock = lastScoreEntry?.clock ?? lastAction?.clock;
  const periodLabel = formatPeriodLabel(period);
  const formattedClock = formatClockLabel(clock);
  if (periodLabel && formattedClock) {
    return `${periodLabel} ${formattedClock}`;
  }
  const statusText = formatStatusText(gameStatus);
  return statusText;
};

export const buildExportRangeData = ({
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
}) => {
  const rangeStart = exportRangeSnapshot.start;
  const rangeEnd = exportRangeSnapshot.end;
  const hasRangeWindow = numPeriods > 0;
  const isInRange = (period) => {
    if (!hasRangeWindow) return true;
    const value = Number(period);
    return Number.isFinite(value) && value >= rangeStart && value <= rangeEnd;
  };
  const exportTimelineWindow = hasRangeWindow
    ? {
      startSeconds: getPeriodStartSeconds(rangeStart),
      durationSeconds: Math.max(
        1,
        getPeriodStartSeconds(rangeEnd) + getPeriodDurationSeconds(rangeEnd) - getPeriodStartSeconds(rangeStart)
      ),
    }
    : timelineWindow;
  const totalGameSeconds = getGameTotalSeconds(numPeriods);
  const durationRatio = totalGameSeconds > 0
    ? exportTimelineWindow.durationSeconds / totalGameSeconds
    : 1;
  const exportScoreTimeline = (displayScoreTimeline || []).filter((entry) => isInRange(entry?.period));
  const exportStatusLabel = buildGameStatusLabel({
    lastAction: displayLastAction,
    gameStatus,
    isFinal,
    isFullGameRange: exportRangeSnapshot.isFullGame,
    periodRange: exportRangeSnapshot,
    scoreTimeline: exportScoreTimeline,
  });
  const exportAwayPlayers = Object.fromEntries(
    Object.entries(displayAwayPlayers || {}).map(([name, actions]) => [
      name,
      (actions || []).filter((action) => isInRange(action?.period)),
    ])
  );
  const exportHomePlayers = Object.fromEntries(
    Object.entries(displayHomePlayers || {}).map(([name, actions]) => [
      name,
      (actions || []).filter((action) => isInRange(action?.period)),
    ])
  );
  const exportAwayPlayerTimeline = Object.fromEntries(
    Object.entries(displayAwayPlayerTimeline || {}).map(([name, timeline]) => [
      name,
      (timeline || []).filter((entry) => isInRange(entry?.period)),
    ])
  );
  const exportHomePlayerTimeline = Object.fromEntries(
    Object.entries(displayHomePlayerTimeline || {}).map(([name, timeline]) => [
      name,
      (timeline || []).filter((entry) => isInRange(entry?.period)),
    ])
  );
  const exportStartScoreDiff = hasRangeWindow
    ? (() => {
      const startSeconds = exportTimelineWindow.startSeconds;
      let diff = 0;
      (displayScoreTimeline || []).forEach((entry) => {
        const elapsed = getSecondsElapsed(entry.period, entry.clock);
        if (elapsed <= startSeconds) {
          diff = Number(entry.away) - Number(entry.home);
        }
      });
      return diff;
    })()
    : 0;
  const exportScoreStats = (() => {
    let max = Math.abs(exportStartScoreDiff || 0);
    exportScoreTimeline.forEach((entry) => {
      const scoreDiff = Math.abs(Number(entry.away) - Number(entry.home));
      if (scoreDiff > max) max = scoreDiff;
    });
    return {
      maxLead: max,
      maxY: Math.floor(max / 5) * 5 + 10,
    };
  })();
  let exportEndAtSeconds = null;
  if (!isFinal && displayLastAction?.period && displayLastAction?.clock) {
    const latestElapsed = getSecondsElapsed(displayLastAction.period, displayLastAction.clock);
    if (Number.isFinite(latestElapsed)) {
      const windowStartSeconds = exportTimelineWindow.startSeconds;
      const windowEndSeconds = windowStartSeconds + exportTimelineWindow.durationSeconds;
      exportEndAtSeconds = Math.min(windowEndSeconds, Math.max(windowStartSeconds, latestElapsed));
    }
  }

  return {
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
  };
};
