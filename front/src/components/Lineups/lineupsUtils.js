// Name formatting constraints for compact lineup pills.
const COMPACT_LAST_NAME_MAX = 12;
const COMPACT_LAST_NAME_KEEP = 10;
const DISPLAY_NAME_MAX = 14;

// Known suffixes/particles to preserve readable last-name parsing.
const SUFFIXES = new Set(['Jr.', 'Sr.', 'II', 'III', 'IV', 'V']);
const LAST_NAME_PARTICLES = new Set([
  'da',
  'de',
  'del',
  'della',
  'di',
  'du',
  'la',
  'le',
  'van',
  'von',
  'ten',
  'ter',
  'st.',
  'saint',
]);

export const DEFAULT_VISIBLE_COUNT = 5;
export const MAX_SELECTED_PLAYERS = 5;
export const SORT_LABELS = {
  minutes: 'MIN',
  plusMinus: '+/-',
};

// Convert seconds into M:SS for lineup minutes display.
export const formatSeconds = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00';
  }
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

// Normalize plus/minus values with explicit positive sign.
export const formatPlusMinus = (value) => {
  if (!Number.isFinite(value) || value === 0) return '0';
  return value > 0 ? `+${value}` : `${value}`;
};

// Build a sorted unique player list from lineup rows.
export const buildPlayerOptions = (lineups) => {
  const players = new Set();
  (lineups || []).forEach((lineup) => {
    (lineup?.players || []).forEach((player) => {
      if (player) players.add(player);
    });
  });
  return Array.from(players).sort((a, b) => a.localeCompare(b));
};

// Filter to 5-man lineups containing every selected player.
export const filterLineupsByPlayers = (lineups, selectedPlayers, mode) => {
  const selected = selectedPlayers || [];
  if (!selected.length || mode !== 'filter') return lineups || [];
  return (lineups || []).filter((lineup) => {
    const players = lineup?.players || [];
    if (players.length !== 5) return false;
    return selected.every((player) => players.includes(player));
  });
};

// Split a full name into parts used for compact display disambiguation.
const parseNameParts = (rawName) => {
  const cleaned = String(rawName || '').trim();
  if (!cleaned) {
    return { cleaned: '', first: '', last: '', baseLast: '' };
  }
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) {
    return { cleaned, first: '', last: parts[0], baseLast: parts[0] };
  }
  const first = parts[0];
  const lastToken = parts[parts.length - 1];
  const hasSuffix = SUFFIXES.has(lastToken) && parts.length >= 3;
  const lastIndex = hasSuffix ? parts.length - 2 : parts.length - 1;
  let baseLast = parts[lastIndex];
  let startIndex = lastIndex;
  while (startIndex - 1 > 0) {
    const candidate = parts[startIndex - 1];
    if (!candidate) break;
    if (!LAST_NAME_PARTICLES.has(candidate.toLowerCase())) break;
    startIndex -= 1;
  }
  if (startIndex < lastIndex) {
    baseLast = parts.slice(startIndex, lastIndex + 1).join(' ');
  }
  const last = hasSuffix ? `${baseLast} ${lastToken}` : baseLast;
  return { cleaned, first, last, baseLast };
};

// Cap the rendered player name length while keeping a trailing period.
const clampDisplay = (value) => {
  if (value.length <= DISPLAY_NAME_MAX) return value;
  const clipped = value.slice(0, DISPLAY_NAME_MAX - 1).replace(/\.+$/, '');
  return `${clipped}.`;
};

// Render a compact player label, adding first initial when last names collide.
export const formatPlayerName = (rawName, lastNameCounts) => {
  const parts = parseNameParts(rawName);
  if (!parts.cleaned) return '';
  if (!parts.baseLast || !parts.last) return parts.cleaned;

  const count = lastNameCounts?.get(parts.baseLast) || 0;
  const needsInitial = count > 1 && parts.first;
  const firstInitial = needsInitial ? `${parts.first.charAt(0)}.` : '';

  let compactLast = parts.last;
  if (parts.last.length > COMPACT_LAST_NAME_MAX) {
    compactLast = `${parts.last.slice(0, COMPACT_LAST_NAME_KEEP)}.`;
  }

  const display = [firstInitial, compactLast].filter(Boolean).join(' ');
  return clampDisplay(display);
};

// Count base last names to know when disambiguating initials are needed.
export const buildLastNameCounts = (lineups) => {
  const uniquePlayers = new Set();
  (lineups || []).forEach((lineup) => {
    (lineup?.players || []).forEach((player) => {
      if (player) uniquePlayers.add(player);
    });
  });

  const counts = new Map();
  uniquePlayers.forEach((player) => {
    const parts = parseNameParts(player);
    if (!parts.baseLast) return;
    counts.set(parts.baseLast, (counts.get(parts.baseLast) || 0) + 1);
  });
  return counts;
};

// Sort by selected primary stat, then by the opposite stat as tie-breaker.
export const sortLineups = (lineups, sortConfig) => {
  const sorted = (lineups || []).slice();
  const { key, direction } = sortConfig;
  const directionFactor = direction === 'desc' ? -1 : 1;
  sorted.sort((a, b) => {
    const primaryA = key === 'plusMinus' ? a.plusMinus : a.seconds;
    const primaryB = key === 'plusMinus' ? b.plusMinus : b.seconds;
    if (primaryA !== primaryB) {
      return (primaryA - primaryB) * directionFactor;
    }
    const secondaryA = key === 'plusMinus' ? a.seconds : a.plusMinus;
    const secondaryB = key === 'plusMinus' ? b.seconds : b.plusMinus;
    return (secondaryA - secondaryB) * directionFactor;
  });
  return sorted;
};

// Toggle direction when re-clicking the same sort key, else default to desc.
export const getNextSortConfig = (previousConfig, nextKey) => ({
  key: nextKey,
  direction:
    previousConfig.key === nextKey && previousConfig.direction === 'desc'
      ? 'asc'
      : 'desc',
});
