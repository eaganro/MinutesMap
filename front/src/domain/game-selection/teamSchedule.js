import { parseGameSlug, parseGameStatus } from './status';

export const NBA_TEAM_ABBRS = [
  'ATL',
  'BKN',
  'BOS',
  'CHA',
  'CHI',
  'CLE',
  'DAL',
  'DEN',
  'DET',
  'GSW',
  'HOU',
  'IND',
  'LAC',
  'LAL',
  'MEM',
  'MIA',
  'MIL',
  'MIN',
  'NOP',
  'NYK',
  'OKC',
  'ORL',
  'PHI',
  'PHX',
  'POR',
  'SAC',
  'SAS',
  'TOR',
  'UTA',
  'WAS',
];

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function normalizeTeamAbbr(value) {
  const abbr = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return NBA_TEAM_ABBRS.includes(abbr) ? abbr : null;
}

// Mirrors the poller's season label: October starts a new season (preseason included).
export function deriveSeasonLabel(dateString) {
  const match = ISO_DATE_RE.exec(dateString || '');
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const startYear = month >= 10 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export function formatShortDate(dateString) {
  const match = ISO_DATE_RE.exec(dateString || '');
  if (!match) {
    return '';
  }
  return `${MONTH_LABELS[Number(match[2]) - 1]} ${Number(match[3])}`;
}

export function gameIdIncludesTeam(gameId, team) {
  const slug = parseGameSlug(gameId);
  const abbr = normalizeTeamAbbr(team);
  if (!slug || !abbr) {
    return false;
  }
  const [, , , away, home] = slug.gameId.split('-');
  const lower = abbr.toLowerCase();
  return away === lower || home === lower;
}

const hasNumber = (value) => value !== null && value !== undefined && value !== '';

function deriveResult(teamScore, oppScore, status) {
  if (!parseGameStatus(status).isFinal || !hasNumber(teamScore) || !hasNumber(oppScore)) {
    return null;
  }
  const team = Number(teamScore);
  const opp = Number(oppScore);
  if (team === opp) {
    return null;
  }
  return team > opp ? 'W' : 'L';
}

function fromTeamRow(row, team) {
  const id = String(row?.gameId || '').trim();
  const date = String(row?.date || '').trim() || parseGameSlug(id)?.date || '';
  const opponent = normalizeTeamAbbr(row?.opponentAbbr);
  if (!id || !date || !opponent) {
    return null;
  }
  const isHome = row.homeAway === 'home';
  const played = row.played !== false && row.result !== null && row.result !== undefined;
  const rowStatus = String(row.status || '').trim();
  // The season file marks a game live once, when the poller first sees it in progress, and
  // only gets its score at the final buzzer. Its status is a stale snapshot and its 0-0 is
  // not a real score, so show it as in progress without one.
  const isLiveSnapshot = !played && parseGameStatus(rowStatus).isLive;
  const status = isLiveSnapshot ? 'In Progress' : rowStatus || (played ? 'Final' : '');
  const teamScore = played ? row.teamScore : null;
  const oppScore = played ? row.oppScore : null;

  return {
    id,
    date,
    starttime: row.start || null,
    status,
    team,
    opponent,
    isHome,
    awayteam: isHome ? opponent : team,
    hometeam: isHome ? team : opponent,
    teamScore,
    oppScore,
    result: row.result === 'W' || row.result === 'L' ? row.result : null,
    seasonType: row.seasonType || null,
  };
}

function fromScheduleGame(game, team) {
  const id = String(game?.id || '').trim();
  const date = String(game?.date || '').trim() || parseGameSlug(id)?.date || '';
  const away = normalizeTeamAbbr(game?.awayteam);
  const home = normalizeTeamAbbr(game?.hometeam);
  if (!id || !date || (away !== team && home !== team)) {
    return null;
  }
  const isHome = home === team;
  const status = String(game.status || '').trim();
  const teamScore = isHome ? game.homescore : game.awayscore;
  const oppScore = isHome ? game.awayscore : game.homescore;
  const isUpcoming = parseGameStatus(status).isUpcoming;

  return {
    id,
    date,
    starttime: game.starttime || null,
    status,
    team,
    opponent: isHome ? away : home,
    isHome,
    awayteam: away,
    hometeam: home,
    teamScore: isUpcoming || !hasNumber(teamScore) ? null : teamScore,
    oppScore: isUpcoming || !hasNumber(oppScore) ? null : oppScore,
    result: deriveResult(teamScore, oppScore, status),
    seasonType: game.seasonType || null,
  };
}

const compareByStart = (a, b) =>
  a.date.localeCompare(b.date) ||
  String(a.starttime || '').localeCompare(String(b.starttime || ''));

/**
 * Builds the team-mode game strip from the season page artifact, overlaying any
 * games in the loaded date schedule (fresher: live scores, just-finished games).
 */
export function buildTeamGames({ payload, team, schedule }) {
  const abbr = normalizeTeamAbbr(team);
  if (!abbr) {
    return [];
  }
  const byId = new Map();
  for (const row of Array.isArray(payload?.games) ? payload.games : []) {
    const game = fromTeamRow(row, abbr);
    if (game) {
      byId.set(game.id, game);
    }
  }
  for (const entry of Array.isArray(schedule) ? schedule : []) {
    const game = fromScheduleGame(entry, abbr);
    if (game) {
      const seasonType = game.seasonType || byId.get(game.id)?.seasonType || null;
      byId.set(game.id, { ...game, seasonType });
    }
  }
  return [...byId.values()].sort(compareByStart);
}

/** Index of the last game on or before `date`, else the first game after it. */
export function findNearestGameIndex(games, date) {
  if (!games?.length) {
    return -1;
  }
  if (!date) {
    return games.length - 1;
  }
  let index = -1;
  games.forEach((game, i) => {
    if (game.date <= date) {
      index = i;
    }
  });
  return index === -1 ? 0 : index;
}

/**
 * Regular-season W-L from the strip; before opening night, the preseason record.
 * Playoff games are left out so the record matches standings.
 */
export function summarizeTeamRecord(games) {
  const tally = (seasonType) => {
    const decided = (games || []).filter(
      (game) => game.result && (game.seasonType || 'regular') === seasonType,
    );
    return {
      wins: decided.filter((game) => game.result === 'W').length,
      losses: decided.filter((game) => game.result === 'L').length,
      seasonType,
    };
  };
  const regular = tally('regular');
  if (regular.wins + regular.losses > 0) {
    return regular;
  }
  const preseason = tally('preseason');
  return preseason.wins + preseason.losses > 0 ? preseason : null;
}
