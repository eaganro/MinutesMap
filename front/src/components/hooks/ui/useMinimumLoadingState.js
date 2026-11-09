import { useEffect, useRef, useState } from 'react';

/**
 * Keep a loading state visible for at least a minimum duration, so switching from one game or
 * date to the next doesn't flicker.
 *
 * @param {boolean} isLoading - Raw loading state.
 * @param {number} minimumMs - Minimum visible duration in milliseconds.
 * @param {{skipFirstLoad?: boolean}} options - `skipFirstLoad` ends the first load as soon as
 *   it finishes, for sections that show a spinner rather than earlier content until then.
 * @returns {boolean} Loading state that stays true for at least minimumMs.
 */
export function useMinimumLoadingState(isLoading, minimumMs, { skipFirstLoad = false } = {}) {
  const [isVisible, setIsVisible] = useState(isLoading);
  const startRef = useRef(0);
  const timeoutRef = useRef(null);
  const hasStartedLoadRef = useRef(false);
  const hasFinishedLoadRef = useRef(false);

  useEffect(() => {
    if (isLoading) {
      startRef.current = Date.now();
      hasStartedLoadRef.current = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setIsVisible(true);
      return undefined;
    }

    const isSkippedFirstLoad = skipFirstLoad && !hasFinishedLoadRef.current;
    if (hasStartedLoadRef.current) hasFinishedLoadRef.current = true;
    const elapsed = Date.now() - startRef.current;
    const remaining = isSkippedFirstLoad ? 0 : minimumMs - elapsed;

    if (remaining <= 0) {
      setIsVisible(false);
      return undefined;
    }

    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
      timeoutRef.current = null;
    }, remaining);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isLoading, minimumMs, skipFirstLoad]);

  return isVisible;
}
