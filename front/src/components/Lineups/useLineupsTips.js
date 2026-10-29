import { useEffect } from 'react';
import { useTipSequence } from '../tips/useTipSequence';

export const LINEUPS_TIPS_STORAGE_KEY = 'lineupTips';
export const LINEUPS_TIP_IDS = ['rows', 'filter'];

/** First-visit tips for the lineups section. */
export function useLineupsTips({ lineupsRef, enabled, hasSelectedPlayers }) {
  const { activeTip, progress, markTip, dismissTip, skipTips } = useTipSequence({
    storageKey: LINEUPS_TIPS_STORAGE_KEY,
    eventName: 'lineup-tip',
    tipIds: LINEUPS_TIP_IDS,
    targetRef: lineupsRef,
    enabled,
  });

  // Picking any player (to filter or highlight) means they found it.
  useEffect(() => {
    if (hasSelectedPlayers && !progress.filter && !progress.skipped) {
      markTip('filter', 'completed');
    }
  }, [hasSelectedPlayers, progress.filter, progress.skipped, markTip]);

  return { activeTip, dismissTip, skipTips };
}
