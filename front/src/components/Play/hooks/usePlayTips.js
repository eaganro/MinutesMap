import { useEffect, useRef } from 'react';
import { TIP_SHOW_DELAY_MS, useTipSequence } from '../../tips/useTipSequence';

export const PLAY_TIPS_STORAGE_KEY = 'playTips';
export const PLAY_TIP_SHOW_DELAY_MS = TIP_SHOW_DELAY_MS;
// Order the tips are shown in. 'player' only applies where player names open the detail
// view, and 'explore' only to touch screens: with a mouse, hovering the chart opens the play
// tooltip by itself, so the 'lines' tip mentions hovering instead. 'stats' points at the
// legend below the chart, so it comes after the tips about the chart itself.
export const PLAY_TIP_IDS = ['lines', 'explore', 'player', 'stats'];

/** First-visit tips for the play-by-play chart and its stat legend. */
export function usePlayTips({
  playRef,
  enabled,
  canSelectPlayers,
  canHover,
  hasOpenTooltip,
  isPlayerDetailOpen,
  statsSignature,
}) {
  const initialStatsSignatureRef = useRef(statsSignature);
  const { activeTip, progress, markTip, dismissTip, skipTips } = useTipSequence({
    storageKey: PLAY_TIPS_STORAGE_KEY,
    eventName: 'play-tip',
    tipIds: PLAY_TIP_IDS,
    targetRef: playRef,
    enabled,
    isTipApplicable: (tip) =>
      (tip !== 'player' || Boolean(canSelectPlayers)) && (tip !== 'explore' || !canHover),
    // The player tip points at names the open tooltip would cover; wait until it closes.
    isTipBlocked: (tip) => tip === 'player' && hasOpenTooltip,
  });

  // Opening the play tooltip (hover, drag, tap or keyboard) means they found it.
  useEffect(() => {
    if (enabled && hasOpenTooltip && !progress.explore && !progress.skipped) {
      markTip('explore', 'completed');
    }
  }, [enabled, hasOpenTooltip, progress.explore, progress.skipped, markTip]);

  useEffect(() => {
    if (isPlayerDetailOpen && !progress.player && !progress.skipped) {
      markTip('player', 'completed');
    }
  }, [isPlayerDetailOpen, progress.player, progress.skipped, markTip]);

  // Any change to the stat legend (a stat, Score Lead or Win Odds) means they found it.
  useEffect(() => {
    if (
      statsSignature !== initialStatsSignatureRef.current &&
      !progress.stats &&
      !progress.skipped
    ) {
      markTip('stats', 'completed');
    }
  }, [statsSignature, progress.stats, progress.skipped, markTip]);

  return { activeTip, dismissTip, skipTips };
}
