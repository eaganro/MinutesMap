import { useCallback } from 'react';
import { useTipSequence } from '../../tips/useTipSequence';

export const PLAY_EXPORT_TIPS_STORAGE_KEY = 'exportTips';
// 'range' only applies when the game has quarters to pick from.
export const PLAY_EXPORT_TIP_IDS = ['view', 'range', 'caption'];

/** First-visit tips for the share image builder. */
export function usePlayExportTips({ previewRef, enabled, hasRangeOptions }) {
  const { activeTip, progress, markTip, dismissTip, skipTips } = useTipSequence({
    storageKey: PLAY_EXPORT_TIPS_STORAGE_KEY,
    eventName: 'export-tip',
    tipIds: PLAY_EXPORT_TIP_IDS,
    targetRef: previewRef,
    enabled,
    isTipApplicable: (tip) => tip !== 'range' || hasRangeOptions,
  });

  // Using the control a tip points at means they found it.
  const completeTip = useCallback(
    (tip) => {
      if (!progress[tip] && !progress.skipped) markTip(tip, 'completed');
    },
    [progress, markTip],
  );

  return { activeTip, completeTip, dismissTip, skipTips };
}
