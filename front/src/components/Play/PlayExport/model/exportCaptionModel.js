const normalizeToken = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();

export const FULL_EXPORT_CAPTION_MAX_LENGTH = 180;
export const PLAYER_EXPORT_CAPTION_MAX_LENGTH = 150;

const resolvePositiveLimit = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const whole = Math.floor(parsed);
  return whole > 0 ? whole : fallback;
};

export const resolveExportCaptionLimits = ({ captions }) => ({
  full: resolvePositiveLimit(captions?.limits?.full, FULL_EXPORT_CAPTION_MAX_LENGTH),
  player: resolvePositiveLimit(captions?.limits?.player, PLAYER_EXPORT_CAPTION_MAX_LENGTH),
});

export const resolveExportCaptionMaxLength = ({ exportView, captions }) => {
  const limits = resolveExportCaptionLimits({ captions });
  return exportView === 'full' ? limits.full : limits.player;
};

export const clampExportCaption = ({ text, exportView, captions }) => {
  const normalizedText = String(text || '');
  const maxLength = resolveExportCaptionMaxLength({ exportView, captions });
  return normalizedText.slice(0, maxLength);
};

const normalizePlayerAliases = (rawName, displayName) => {
  const aliases = new Set();
  const push = (value) => {
    const normalized = normalizeToken(value);
    if (normalized) aliases.add(normalized);
  };

  push(rawName);
  push(displayName);
  push(String(rawName || '').replace(/#\d+$/, ''));
  push(String(displayName || '').replace(/#\d+$/, ''));
  return aliases;
};

const resolvePeriodEntry = (periods, periodEnd) => {
  if (!periods || typeof periods !== 'object') return null;
  const exact = periods[String(periodEnd)];
  return exact && typeof exact === 'object' ? exact : null;
};

const resolvePeriodEntriesWithPrevious = (periods, periodEnd) => ({
  current: resolvePeriodEntry(periods, periodEnd),
  previous: periodEnd > 1 ? resolvePeriodEntry(periods, periodEnd - 1) : null,
});

const resolveFullCaptionFromPeriodEntry = (periodEntry) => String(periodEntry?.full || '').trim();

const resolveMatchingPlayerCaptionFromPeriodEntry = ({
  periodEntry,
  selectedPlayer,
  playerDisplayName,
}) => {
  if (!selectedPlayer?.name || !selectedPlayer?.teamKey) {
    return '';
  }

  const aliases = normalizePlayerAliases(selectedPlayer.name, playerDisplayName);
  const stories = Array.isArray(periodEntry?.players) ? periodEntry.players : [];
  const matching = stories.find((story) => {
    if (!story || typeof story !== 'object') return false;
    if (story.team !== selectedPlayer.teamKey) return false;
    return aliases.has(normalizeToken(story.player));
  });

  return matching ? String(matching.caption || '').trim() : '';
};

export const resolveDefaultExportCaption = ({
  captions,
  exportView,
  exportRange,
  selectedPlayer,
  playerDisplayName,
}) => {
  const periods = captions?.periods;
  const periodEnd = Number(exportRange?.end);
  if (!Number.isFinite(periodEnd) || periodEnd <= 0) return '';

  const { current, previous } = resolvePeriodEntriesWithPrevious(periods, periodEnd);

  if (exportView === 'full') {
    const currentCaption = resolveFullCaptionFromPeriodEntry(current);
    if (currentCaption) return currentCaption;
    return resolveFullCaptionFromPeriodEntry(previous);
  }

  return resolvePlayerExportCaption({
    captions,
    exportRange,
    selectedPlayer,
    playerDisplayName,
  });
};

export const resolvePlayerExportCaption = ({
  captions,
  exportRange,
  selectedPlayer,
  playerDisplayName,
}) => {
  if (!selectedPlayer?.name || !selectedPlayer?.teamKey) {
    return '';
  }

  const periodEnd = Number(exportRange?.end);
  if (!Number.isFinite(periodEnd) || periodEnd <= 0) return '';
  const { current, previous } = resolvePeriodEntriesWithPrevious(captions?.periods, periodEnd);

  const currentCaption = resolveMatchingPlayerCaptionFromPeriodEntry({
    periodEntry: current,
    selectedPlayer,
    playerDisplayName,
  });
  if (currentCaption) return currentCaption;

  return resolveMatchingPlayerCaptionFromPeriodEntry({
    periodEntry: previous,
    selectedPlayer,
    playerDisplayName,
  });
};

export const resolvePlayerCaptionPeriods = ({ captions, selectedPlayer, playerDisplayName }) => {
  if (!selectedPlayer?.name || !selectedPlayer?.teamKey) {
    return [];
  }

  const aliases = normalizePlayerAliases(selectedPlayer.name, playerDisplayName);
  const periods = captions?.periods;
  if (!periods || typeof periods !== 'object') return [];

  const matches = Object.entries(periods)
    .map(([key, value]) => ({ period: Number(key), value }))
    .filter((entry) => Number.isFinite(entry.period) && entry.period > 0 && entry.value)
    .sort((a, b) => a.period - b.period)
    .filter((entry) => {
      const stories = Array.isArray(entry.value?.players) ? entry.value.players : [];
      return stories.some((story) => {
        if (!story || typeof story !== 'object') return false;
        if (story.team !== selectedPlayer.teamKey) return false;
        if (!String(story.caption || '').trim()) return false;
        return aliases.has(normalizeToken(story.player));
      });
    })
    .map((entry) => entry.period);

  return matches;
};

export const resolveFullCaptionPeriods = ({ captions }) => {
  const periods = captions?.periods;
  if (!periods || typeof periods !== 'object') return [];

  return Object.entries(periods)
    .map(([key, value]) => ({ period: Number(key), value }))
    .filter((entry) => Number.isFinite(entry.period) && entry.period > 0 && entry.value)
    .sort((a, b) => a.period - b.period)
    .filter((entry) => Boolean(String(entry.value?.full || '').trim()))
    .map((entry) => entry.period);
};
