import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalStorageState } from '../hooks/state/useLocalStorageState';
import { trackPostHogEvent } from '../../helpers/analytics';

export const TIP_SHOW_DELAY_MS = 700;

// Sections can be taller than a phone screen, so wait until a good part is on screen.
const MIN_VISIBLE_RATIO = 0.3;

const isTipProgress = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const TIP_STORAGE_OPTIONS = { validate: isTipProgress };
const alwaysApplicable = () => true;
const neverBlocked = () => false;

/**
 * First-visit tips shown one at a time, in `tipIds` order. Each stays until the viewer does
 * what it points at (the caller marks it 'completed') or dismisses it, and progress is
 * remembered per browser under `storageKey`.
 *
 * - `isTipApplicable(tip)`: false leaves a tip out of the sequence entirely.
 * - `isTipBlocked(tip)`: true holds a tip (and the ones after it) back for now.
 */
export function useTipSequence({
  storageKey,
  eventName,
  tipIds,
  targetRef,
  enabled,
  isTipApplicable = alwaysApplicable,
  isTipBlocked = neverBlocked,
}) {
  const [progress, setProgress] = useLocalStorageState(storageKey, {}, TIP_STORAGE_OPTIONS);
  const [isReady, setIsReady] = useState(false);
  const shownTipsRef = useRef(new Set());

  const isTipPending = (tip) => !progress[tip] && isTipApplicable(tip);
  const hasPendingTips = !progress.skipped && tipIds.some(isTipPending);

  const trackTip = useCallback(
    (tip, outcome, data = {}) => trackPostHogEvent(eventName, { tip, outcome, ...data }),
    [eventName],
  );

  const markTip = useCallback(
    (tip, outcome) => {
      setProgress((prev) => (prev[tip] ? prev : { ...prev, [tip]: true }));
      trackTip(tip, outcome, { wasShown: shownTipsRef.current.has(tip) });
    },
    [setProgress, trackTip],
  );

  // Show the first tip once the section has been on screen for a moment, so it doesn't
  // flash past someone scrolling by. Once shown, tips stay put.
  useEffect(() => {
    if (!enabled || !hasPendingTips || isReady) return undefined;
    const node = targetRef.current;
    if (!node) return undefined;

    let timer = null;
    const arm = () => {
      if (!timer) timer = setTimeout(() => setIsReady(true), TIP_SHOW_DELAY_MS);
    };
    const disarm = () => {
      clearTimeout(timer);
      timer = null;
    };

    if (typeof IntersectionObserver !== 'function') {
      arm();
      return disarm;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && entry.intersectionRatio >= MIN_VISIBLE_RATIO) {
          arm();
        } else {
          disarm();
        }
      },
      { threshold: [0, MIN_VISIBLE_RATIO, 0.6] },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      disarm();
    };
  }, [enabled, hasPendingTips, isReady, targetRef]);

  let activeTip = null;
  if (enabled && isReady && !progress.skipped) {
    activeTip = tipIds.find(isTipPending) || null;
    if (activeTip && isTipBlocked(activeTip)) {
      activeTip = null;
    }
  }

  useEffect(() => {
    if (activeTip && !shownTipsRef.current.has(activeTip)) {
      shownTipsRef.current.add(activeTip);
      trackTip(activeTip, 'shown');
    }
  }, [activeTip, trackTip]);

  const dismissTip = useCallback((tip) => markTip(tip, 'dismissed'), [markTip]);

  const skipTips = useCallback(() => {
    setProgress((prev) => ({ ...prev, skipped: true }));
    trackTip(activeTip, 'skipped');
  }, [activeTip, setProgress, trackTip]);

  return { activeTip, progress, markTip, dismissTip, skipTips };
}
