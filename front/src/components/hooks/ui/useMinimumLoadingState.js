import { useEffect, useRef, useState } from 'react';

/**
 * Keep a loading state visible for at least a minimum duration.
 *
 * @param {boolean} isLoading - Raw loading state.
 * @param {number} minimumMs - Minimum visible duration in milliseconds.
 * @returns {boolean} Loading state that stays true for at least minimumMs.
 */
export function useMinimumLoadingState(isLoading, minimumMs) {
  const [isVisible, setIsVisible] = useState(isLoading);
  const startRef = useRef(0);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (isLoading) {
      startRef.current = Date.now();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setIsVisible(true);
      return undefined;
    }

    const elapsed = Date.now() - startRef.current;
    const remaining = minimumMs - elapsed;

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
  }, [isLoading, minimumMs]);

  return isVisible;
}
