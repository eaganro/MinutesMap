/**
 * Game selection and date formatting utilities
 */

export const MAX_AUTO_LOOKBACK_DAYS = 10;
export const GAME_NOT_STARTED_MESSAGE = 'Game data is not available yet. The game has not started.';

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

