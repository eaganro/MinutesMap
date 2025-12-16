import { useRef, useCallback, useEffect } from 'react';
import { 
  shiftDateString, 
  sortGamesForSelection, 
  findFirstStartedOrCompletedGame,
  MAX_AUTO_LOOKBACK_DAYS 
} from '../../helpers/gameSelectionUtils';

/**
 * Hook for automatically selecting a game on initial load
 * Looks back through previous dates to find a started/completed game
 */
export function useAutoSelectGame({
  initialDate,
  initialGameId,
  date,
  gameId,
  onSelectGame,
  onLookbackDate,
}) {
  const isActiveRef = useRef(!initialGameId);
  const visitedDatesRef = useRef(new Set(initialDate ? [initialDate] : []));
  const attemptsRef = useRef(0);
  const dateRef = useRef(date);
  const gameIdRef = useRef(gameId);

  // Keep refs in sync with current values
  useEffect(() => { dateRef.current = date; }, [date]);
  useEffect(() => { gameIdRef.current = gameId; }, [gameId]);

  /**
   * Disable auto-selection (called when user manually selects)
   */
  const disableAutoSelect = useCallback(() => {
    isActiveRef.current = false;
  }, []);

  /**
   * Attempt to auto-select a game from the incoming games list
   * If no suitable game found, looks back to previous date
   */
  const attemptAutoSelect = useCallback((incomingGames, scheduleDate) => {
    const gamesList = Array.isArray(incomingGames) ? incomingGames : [];
    const effectiveDate = scheduleDate || dateRef.current;
    
    if (effectiveDate) {
      visitedDatesRef.current.add(effectiveDate);
    }

    // If auto-select is disabled, do nothing
    if (!isActiveRef.current) {
      return;
    }

    const sortedGames = sortGamesForSelection(gamesList);
    const firstStartedOrCompleted = findFirstStartedOrCompletedGame(sortedGames, true);
    
    // Found a started/completed game - select it
    if (firstStartedOrCompleted) {
      isActiveRef.current = false;
      if (gameIdRef.current !== firstStartedOrCompleted.id) {
        onSelectGame(firstStartedOrCompleted.id);
      }
      return;
    }

    // No effective date - fall back to first game
    if (!effectiveDate) {
      isActiveRef.current = false;
      const fallbackGame = sortedGames[0];
      if (!gameIdRef.current && fallbackGame) {
        onSelectGame(fallbackGame.id);
      }
      return;
    }

    // Max lookback reached - fall back to first game
    if (attemptsRef.current >= MAX_AUTO_LOOKBACK_DAYS) {
      isActiveRef.current = false;
      const fallbackGame = sortedGames[0];
      if (!gameIdRef.current && fallbackGame) {
        onSelectGame(fallbackGame.id);
      }
      return;
    }

    // Try previous date
    const previousDate = shiftDateString(effectiveDate, -1);
    if (!previousDate || visitedDatesRef.current.has(previousDate)) {
      isActiveRef.current = false;
      const fallbackGame = sortedGames[0];
      if (!gameIdRef.current && fallbackGame) {
        onSelectGame(fallbackGame.id);
      }
      return;
    }

    // Look back to previous date
    attemptsRef.current += 1;
    visitedDatesRef.current.add(previousDate);
    onLookbackDate(previousDate);
  }, [onSelectGame, onLookbackDate]);

  return {
    attemptAutoSelect,
    disableAutoSelect,
  };
}

