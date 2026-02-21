const normalizeToken = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();

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
  if (exact && typeof exact === 'object') return exact;

  const eligible = Object.entries(periods)
    .map(([key, value]) => ({ period: Number(key), value }))
    .filter(
      (item) =>
        Number.isFinite(item.period) &&
        item.period > 0 &&
        item.period <= periodEnd &&
        item.value &&
        typeof item.value === 'object',
    )
    .sort((a, b) => b.period - a.period);

  return eligible.length ? eligible[0].value : null;
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

  const periodEntry = resolvePeriodEntry(periods, periodEnd);
  if (!periodEntry) return '';

  if (exportView === 'full') {
    return String(periodEntry.full || '').trim();
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
  const periodEntry = resolvePeriodEntry(captions?.periods, periodEnd);
  if (!periodEntry) return '';

  const aliases = normalizePlayerAliases(selectedPlayer.name, playerDisplayName);
  const stories = Array.isArray(periodEntry.players) ? periodEntry.players : [];
  const matching = stories.find((story) => {
    if (!story || typeof story !== 'object') return false;
    if (story.team !== selectedPlayer.teamKey) return false;
    return aliases.has(normalizeToken(story.player));
  });

  return matching ? String(matching.caption || '').trim() : '';
};
