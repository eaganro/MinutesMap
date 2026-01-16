import { useCallback } from 'react';

const DATE_PATH_RE = /^\d{4}-\d{2}-\d{2}$/;
const GAME_ID_RE = /^\d+$/;

function parsePathParams(pathname) {
  const trimmed = pathname.replace(/^\/+|\/+$/g, '');
  if (!trimmed) {
    return { date: null, gameId: null };
  }

  const [dateSegment, gameSegment] = trimmed.split('/');
  if (!dateSegment || !DATE_PATH_RE.test(dateSegment)) {
    return { date: null, gameId: null };
  }

  const gameId = gameSegment && GAME_ID_RE.test(gameSegment)
    ? gameSegment
    : null;

  return { date: dateSegment, gameId };
}

/**
 * Hook for managing URL query parameters
 */
export function useQueryParams() {
  /**
   * Get initial params from the URL (path preferred, query fallback)
   */
  const getInitialParams = useCallback(() => {
    const pathParams = parsePathParams(window.location.pathname);
    if (pathParams.date) {
      return pathParams;
    }

    const params = new URLSearchParams(window.location.search);
    return {
      date: params.get('date'),
      gameId: params.get('gameid'),
    };
  }, []);

  /**
   * Update the URL without page reload (path preferred, query preserved)
   */
  const updateQueryParams = useCallback((newDate, newGameId) => {
    const params = new URLSearchParams(window.location.search);
    params.delete('date');
    params.delete('gameid');

    const pathSegments = [];
    if (newDate) {
      pathSegments.push(encodeURIComponent(newDate));
    }
    if (newGameId) {
      pathSegments.push(encodeURIComponent(newGameId));
    }

    const pathname = pathSegments.length > 0
      ? `/${pathSegments.join('/')}`
      : '/';
    const query = params.toString();
    const newUrl = `${pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', newUrl);
  }, []);

  return { getInitialParams, updateQueryParams };
}
