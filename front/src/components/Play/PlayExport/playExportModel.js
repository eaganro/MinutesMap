import { DESKTOP_EXPORT_WIDTH, MOBILE_EXPORT_MAX_WIDTH } from './playExportCore';
import { formatPeriodLabel } from './playExportRange';

export const DEFAULT_EXPORT_VIEW = 'full';
export const EXPORT_VIEWS = ['full', 'player-stacked', 'player'];
export const EXPORT_VIEW_OPTIONS = [
  { value: 'full', label: 'Full Timeline' },
  { value: 'player-stacked', label: 'Single Player Stacked' },
  { value: 'player', label: 'Single Player' },
];

/**
 * @typedef {'full' | 'player' | 'player-stacked'} ExportView
 */

/**
 * @typedef {Object} ExportRange
 * @property {number} start
 * @property {number} end
 * @property {boolean} isFullGame
 */

/**
 * @typedef {Object} ExportInput
 * @property {ExportView} exportView
 * @property {ExportRange} periodRange
 * @property {number} exportWidth
 * @property {{ name: string, teamKey: 'away' | 'home' } | null} [selectedPlayer]
 */

/**
 * @typedef {Object} ExportResult
 * @property {Blob} blob
 * @property {string} fileName
 * @property {string} [url]
 */

/**
 * @typedef {Object} SharePayload
 * @property {File[]} files
 * @property {string} [title]
 * @property {string} [text]
 * @property {string} [url]
 */

const sanitizeFilePart = (value) =>
  String(value || '')
    .trim()
    .replace(/[^a-z0-9-_]+/gi, '_')
    .replace(/^_+|_+$/g, '');

const resolveTeamLabel = (team) => {
  if (!team) return null;
  return team.name || team.abr || null;
};

export const isValidExportView = (value) => EXPORT_VIEWS.includes(value);

export const buildPlayExportFileName = ({
  awayTeamNames,
  homeTeamNames,
  rangeLabel,
  isFullGameRange,
  gameId,
}) => {
  const away = awayTeamNames?.abr || 'Away';
  const home = homeTeamNames?.abr || 'Home';
  const periodLabel = rangeLabel || (isFullGameRange ? 'Game' : 'Range');
  const base = periodLabel ? `${away}-vs-${home}-${periodLabel}` : `${away}-vs-${home}`;
  const safeBase = sanitizeFilePart(base) || 'play-by-play';
  const suffix = gameId ? `-${sanitizeFilePart(gameId)}` : '';
  return `${safeBase}${suffix}.png`;
};

export const buildShareTitle = ({ awayTeamNames, homeTeamNames, rangeLabel }) => {
  const away = resolveTeamLabel(awayTeamNames);
  const home = resolveTeamLabel(homeTeamNames);
  const matchup = away && home ? `${away} vs ${home}` : 'Play-by-play chart';
  const rangeSuffix = rangeLabel ? ` (${rangeLabel})` : '';
  return `${matchup}${rangeSuffix}`;
};

export const buildShareText = ({ awayTeamNames, homeTeamNames, rangeLabel }) => {
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

export const buildGameShareUrl = ({ gameId, origin }) => {
  const trimmed = String(gameId || '').trim();
  if (!trimmed) return null;
  const pathname = `/${encodeURIComponent(trimmed)}`;
  return origin ? `${origin}${pathname}` : pathname;
};

export const buildShareMetadata = ({
  awayTeamNames,
  homeTeamNames,
  rangeLabel,
  gameId,
  origin,
}) => ({
  title: buildShareTitle({ awayTeamNames, homeTeamNames, rangeLabel }),
  text: buildShareText({ awayTeamNames, homeTeamNames, rangeLabel }),
  url: buildGameShareUrl({ gameId, origin }),
});

export const buildExportPreviewKey = ({ exportRange, exportView, exportPlayerKey }) => {
  const rangeKey = `${exportRange.start}-${exportRange.end}`;
  if (exportView !== DEFAULT_EXPORT_VIEW) {
    return `${rangeKey}|${exportView}|${exportPlayerKey || ''}`;
  }
  return `${rangeKey}|${exportView}`;
};

export const buildExportPlayerOptions = ({
  displayAwayPlayers,
  displayHomePlayers,
  displayAwayTeamNames,
  displayHomeTeamNames,
}) => {
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
};

const normalizeNameToken = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z\s'.-]/g, '')
    .trim();

export const resolveFullNameFromRoster = (rawName, rosterPlayers) => {
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

export const buildExportRangeOptions = (numPeriods) => {
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
};

export const buildExportDimensions = ({ exportView, isFullGameRange, durationRatio }) => {
  const scaledWidth = DESKTOP_EXPORT_WIDTH * durationRatio;
  const stackedWidth = Math.min(360, MOBILE_EXPORT_MAX_WIDTH, DESKTOP_EXPORT_WIDTH);
  const exportWidth =
    exportView === 'player-stacked'
      ? stackedWidth
      : isFullGameRange
        ? DESKTOP_EXPORT_WIDTH
        : Math.max(360, Math.min(MOBILE_EXPORT_MAX_WIDTH, scaledWidth));
  return { exportWidth };
};
