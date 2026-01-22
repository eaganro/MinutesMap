/**
 * Game selection and date formatting utilities
 */

export const MAX_AUTO_LOOKBACK_DAYS = 10;
export const GAME_NOT_STARTED_MESSAGE = 'Game data is not available yet. The game has not started.';
const ET_TIME_ZONE = 'America/New_York';
const GAME_SLUG_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]{2,}-[a-z0-9]{2,}$/i;

function getTimeZoneParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function getTimeZoneOffset(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return (asUtc - date.getTime()) / 60000;
}

/**
 * Format a Date object to YYYY-MM-DD string
 */
export function formatDateString(dateObj) {
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${dateObj.getFullYear()}-${month}-${day}`;
}

/**
 * Get today's date as YYYY-MM-DD string
 */
export function getTodayString() {
  return formatDateString(new Date());
}

export function isGameSlug(value) {
  if (!value || typeof value !== 'string') {
    return false;
  }
  return GAME_SLUG_RE.test(value.trim());
}

export function parseGameSlug(value) {
  if (!isGameSlug(value)) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  const date = normalized.slice(0, 10);
  return { date, gameId: normalized };
}

export function getNbaTodayString(now = new Date()) {
  const parts = getTimeZoneParts(now, ET_TIME_ZONE);
  let year = parts.year;
  let month = parts.month;
  let day = parts.day;

  if (parts.hour < 4) {
    const prevUtc = Date.UTC(year, month - 1, day) - 24 * 60 * 60 * 1000;
    const prev = new Date(prevUtc);
    year = prev.getUTCFullYear();
    month = prev.getUTCMonth() + 1;
    day = prev.getUTCDate();
  }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function parseStartTimeEt(startTime) {
  if (!startTime || typeof startTime !== 'string') {
    return null;
  }

  let ts = startTime.trim();
  if (!ts) {
    return null;
  }

  const hasOffset = /([zZ]|[+-]\d{2}:?\d{2})$/.test(ts);
  const hasZulu = /[zZ]$/.test(ts);

  if (hasOffset && !hasZulu) {
    const parsed = new Date(ts);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (hasZulu) {
    ts = ts.slice(0, -1);
  }

  const match = ts.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    const parsed = new Date(ts);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || '0');

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMinutes = getTimeZoneOffset(new Date(utcGuess), ET_TIME_ZONE);
  const utcTime = utcGuess - offsetMinutes * 60000;
  const parsed = new Date(utcTime);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Shift a date string by a number of days
 */
export function shiftDateString(dateString, offset) {
  if (!dateString) {
    return null;
  }
  const base = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(base.getTime())) {
    return null;
  }
  base.setDate(base.getDate() + offset);
  return formatDateString(base);
}

/**
 * Parse game status to determine its state
 */
export function parseGameStatus(status) {
  const trimmed = (status || '').trim();
  const isFinal = trimmed.startsWith('Final');
  const isUpcoming = trimmed.endsWith('ET');
  const isLive = !!trimmed && !isFinal && !isUpcoming;
  
  return { isFinal, isUpcoming, isLive, status: trimmed };
}

/**
 * Compare two games for sorting/selection priority
 * Priority: Live > Upcoming > Final, then by start time
 */
export function compareGamesForSelection(a, b) {
  const statusA = parseGameStatus(a?.status);
  const statusB = parseGameStatus(b?.status);
  const timeA = new Date(a?.starttime || '').getTime();
  const timeB = new Date(b?.starttime || '').getTime();
  const safeTimeA = Number.isFinite(timeA) ? timeA : 0;
  const safeTimeB = Number.isFinite(timeB) ? timeB : 0;

  // Bucket: 0 = live, 1 = upcoming, 2 = final
  const bucketA = statusA.isLive ? 0 : (statusA.isUpcoming ? 1 : (statusA.isFinal ? 2 : 1));
  const bucketB = statusB.isLive ? 0 : (statusB.isUpcoming ? 1 : (statusB.isFinal ? 2 : 1));
  
  if (bucketA < bucketB) return -1;
  if (bucketA > bucketB) return 1;

  // Within same bucket, sort by time
  if (safeTimeA < safeTimeB) return -1;
  if (safeTimeA > safeTimeB) return 1;

  // Fallback to team name
  if ((a?.hometeam || '') > (b?.hometeam || '')) return 1;
  if ((a?.hometeam || '') < (b?.hometeam || '')) return -1;
  return 0;
}

/**
 * Sort games for selection priority
 */
export function sortGamesForSelection(games = []) {
  return [...games].sort(compareGamesForSelection);
}

export function scheduleMatchesDate(games, dateValue) {
  if (!games || games.length === 0 || !dateValue) {
    return false;
  }
  return games.some((game) => {
    const start = typeof game?.starttime === 'string' ? game.starttime.trim() : '';
    if (!start) {
      return false;
    }
    const match = start.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] === dateValue : false;
  });
}

/**
 * Find the first game that has started or completed
 */
export function findFirstStartedOrCompletedGame(games = [], alreadySorted = false) {
  const list = alreadySorted ? games : sortGamesForSelection(games);
  return list.find((game) => {
    const { status } = parseGameStatus(game?.status);
    return status && !status.endsWith('ET');
  }) || null;
}
