export const MAX_AUTO_LOOKBACK_DAYS = 10;
export const GAME_NOT_STARTED_MESSAGE = 'Game data is not available yet. The game has not started.';
const GAME_SLUG_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]{2,}-[a-z0-9]{2,}$/i;

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

export function parseGameStatus(status) {
  const trimmed = (status || '').trim();
  const lower = trimmed.toLowerCase();
  const isFinal =
    trimmed.startsWith('Final') ||
    lower.startsWith('postponed') ||
    lower.startsWith('cancelled') ||
    lower.startsWith('canceled') ||
    lower.startsWith('ppd');
  const isUpcoming = trimmed.endsWith('ET');
  const isLive = !!trimmed && !isFinal && !isUpcoming;

  return { isFinal, isUpcoming, isLive, status: trimmed };
}

export function compareGamesForSelection(a, b) {
  const statusA = parseGameStatus(a?.status);
  const statusB = parseGameStatus(b?.status);
  const timeA = new Date(a?.starttime || '').getTime();
  const timeB = new Date(b?.starttime || '').getTime();
  const safeTimeA = Number.isFinite(timeA) ? timeA : 0;
  const safeTimeB = Number.isFinite(timeB) ? timeB : 0;

  const bucketA = statusA.isLive ? 0 : statusA.isUpcoming ? 1 : statusA.isFinal ? 2 : 1;
  const bucketB = statusB.isLive ? 0 : statusB.isUpcoming ? 1 : statusB.isFinal ? 2 : 1;

  if (bucketA < bucketB) return -1;
  if (bucketA > bucketB) return 1;

  if (safeTimeA < safeTimeB) return -1;
  if (safeTimeA > safeTimeB) return 1;

  if ((a?.hometeam || '') > (b?.hometeam || '')) return 1;
  if ((a?.hometeam || '') < (b?.hometeam || '')) return -1;
  return 0;
}

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

export function findFirstStartedOrCompletedGame(games = [], alreadySorted = false) {
  const list = alreadySorted ? games : sortGamesForSelection(games);
  return (
    list.find((game) => {
      const { status } = parseGameStatus(game?.status);
      return status && !status.endsWith('ET');
    }) || null
  );
}
