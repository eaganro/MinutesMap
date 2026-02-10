import { useMemo } from 'react';
import { filterPlayerActions } from '../../domain/game-data/filterActions';
import { normalizePlayByPlay } from '../../domain/game-data/normalizePlayByPlay';

/**
 * Hook for transforming raw play-by-play data into UI-ready timelines and actions.
 * Extracts heavy data processing logic from the view component.
 *
 * @param {Array|Object} playByPlay - Raw play-by-play array OR pre-processed payload from S3
 * @param {number|null} _homeTeamId - ID of the home team (unused compatibility parameter)
 * @param {number|null} _awayTeamId - ID of the away team (unused compatibility parameter)
 * @param {Object|null} _lastAction - The last action in the play-by-play data (unused compatibility parameter)
 * @param {boolean[]} statOn - Array of stat filter toggles
 * @returns {Object} Processed timeline and action data
 */
export function useGameTimeline(playByPlay, _homeTeamId, _awayTeamId, _lastAction, statOn) {
  return useMemo(() => {
    const normalized = normalizePlayByPlay(playByPlay);

    return {
      scoreTimeline: normalized.scoreTimeline,
      homePlayerTimeline: normalized.homePlayerTimeline,
      awayPlayerTimeline: normalized.awayPlayerTimeline,
      allActions: normalized.allActions,
      awayActions: filterPlayerActions(normalized.awayActionsAll, statOn),
      homeActions: filterPlayerActions(normalized.homeActionsAll, statOn),
      awayActionsAll: normalized.awayActionsAll,
      homeActionsAll: normalized.homeActionsAll,
    };
  }, [playByPlay, statOn]);
}
