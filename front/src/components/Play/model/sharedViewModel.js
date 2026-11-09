// A shared link opens the game on the view its image showed: `?q=` is a period number (or
// `game` for the whole game) and `?player=` a player's name, which opens that player's view
// where there is one (phones). Read once when the page loads, then removed from the URL.
export const SHARED_PERIOD_PARAM = 'q';
export const SHARED_PLAYER_PARAM = 'player';
const WHOLE_GAME_VALUE = 'game';

/** The view a share image shows: one period, or the whole game (0) for longer ranges. */
export function buildSharedView({ exportView, exportRange, playerName }) {
  const start = Number(exportRange?.start);
  const end = Number(exportRange?.end);
  const period = Number.isInteger(start) && start > 0 && start === end ? start : 0;
  const name = String(playerName || '').trim();
  return exportView !== 'full' && name ? { period, playerName: name } : { period };
}

/** The share-link query string for a view, e.g. `?q=4&player=Joel+Embiid` (or ''). */
export function buildSharedViewQuery(view) {
  if (!view) return '';
  const params = new URLSearchParams();
  if (Number.isInteger(view.period) && view.period >= 0) {
    params.set(SHARED_PERIOD_PARAM, view.period === 0 ? WHOLE_GAME_VALUE : String(view.period));
  }
  if (view.playerName) params.set(SHARED_PLAYER_PARAM, view.playerName);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** The shared view in a URL's query string, or null. Unreadable parts are left out. */
export function parseSharedView(search) {
  const params = new URLSearchParams(search || '');
  const rawPeriod = (params.get(SHARED_PERIOD_PARAM) || '').trim().toLowerCase();
  let period = null;
  if (rawPeriod === WHOLE_GAME_VALUE) {
    period = 0;
  } else if (/^\d{1,2}$/.test(rawPeriod) && Number(rawPeriod) > 0) {
    period = Number(rawPeriod);
  }
  const playerName = (params.get(SHARED_PLAYER_PARAM) || '').trim() || null;
  if (period === null && !playerName) return null;
  return { period, playerName };
}

/** `href` without the shared-view parameters, keeping everything else. */
export function removeSharedViewParams(href) {
  const url = new URL(href);
  url.searchParams.delete(SHARED_PERIOD_PARAM);
  url.searchParams.delete(SHARED_PLAYER_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
