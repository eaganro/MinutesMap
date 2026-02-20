import { useMemo } from 'react';
import { filterPlayerActions } from '../../../domain/game-data/filterActions';
import { normalizePlayByPlay } from '../../../domain/game-data/normalizePlayByPlay';

/**
 * Hook for transforming raw play-by-play data into UI-ready timelines and actions.
 * Extracts heavy data processing logic from the view component.
 *
 * @param {Array|Object} playByPlay - Raw play-by-play array OR pre-processed payload from S3
 * @param {boolean[]} statOn - Array of stat filter toggles
 * @returns {Object} Processed timeline and action data
 */
export function useGameTimeline(playByPlay, statOn) {
  return useMemo(() => {
    const normalized = normalizePlayByPlay(playByPlay);
    const awayFilteredActions = filterPlayerActions(normalized.awayActionsAll, statOn);
    const homeFilteredActions = filterPlayerActions(normalized.homeActionsAll, statOn);

    return {
      scoreTimeline: normalized.scoreTimeline,
      homePlayerTimeline: normalized.homePlayerTimeline,
      awayPlayerTimeline: normalized.awayPlayerTimeline,
      allActions: normalized.allActions,
      captions: normalized.captions,
      playerActions: {
        away: {
          filtered: awayFilteredActions,
          all: normalized.awayActionsAll,
        },
        home: {
          filtered: homeFilteredActions,
          all: normalized.homeActionsAll,
        },
      },
    };
  }, [playByPlay, statOn]);
}
