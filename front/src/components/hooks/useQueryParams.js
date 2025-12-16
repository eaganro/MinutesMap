import { useCallback } from 'react';

/**
 * Hook for managing URL query parameters
 */
export function useQueryParams() {
  /**
   * Get initial query parameters from the URL
   */
  const getInitialParams = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      date: params.get('date'),
      gameId: params.get('gameid'),
    };
  }, []);

  /**
   * Update the URL query parameters without page reload
   */
  const updateQueryParams = useCallback((newDate, newGameId) => {
    const params = new URLSearchParams(window.location.search);
    
    if (newDate) {
      params.set('date', newDate);
    } else {
      params.delete('date');
    }
    
    if (newGameId) {
      params.set('gameid', newGameId);
    } else {
      params.delete('gameid');
    }
    
    const query = params.toString();
    const newUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', newUrl);
  }, []);

  return { getInitialParams, updateQueryParams };
}

