import { useCallback } from 'react';
import { parseGameSlug } from '../../helpers/gameSelectionUtils';

const DATE_PATH_RE = /^\d{4}-\d{2}-\d{2}$/;

function parsePathParams(pathname) {
  const trimmed = pathname.replace(/^\/+|\/+$/g, '');
  if (!trimmed) {
    return { date: null, gameId: null };
  }

  const segments = trimmed.split('/').filter(Boolean);
  if (segments.length === 1) {
    const slugParams = parseGameSlug(segments[0]);
    if (slugParams) {
      return slugParams;
    }
    if (DATE_PATH_RE.test(segments[0])) {
      return { date: segments[0], gameId: null };
    }
    return { date: null, gameId: null };
  }

  const [dateSegment, gameSegment] = segments;
  const slugParams = parseGameSlug(gameSegment) || parseGameSlug(dateSegment);
  if (slugParams) {
    return slugParams;
  }
  if (DATE_PATH_RE.test(dateSegment)) {
    return { date: dateSegment, gameId: null };
  }

  return { date: null, gameId: null };
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
    const rawGameId = params.get('gameid');
    const slugParams = parseGameSlug(rawGameId);
    return {
      date: slugParams?.date ?? params.get('date'),
      gameId: slugParams?.gameId ?? null,
    };
  }, []);

  /**
   * Update the URL without page reload (path preferred, query preserved)
   */
  const updateQueryParams = useCallback((newDate, newGameId) => {
    const params = new URLSearchParams(window.location.search);
    params.delete('date');
    params.delete('gameid');

    const pathname = newGameId ? `/${encodeURIComponent(newGameId)}` : '/';
    const query = params.toString();
    const newUrl = `${pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', newUrl);
  }, []);

  return { getInitialParams, updateQueryParams };
}
