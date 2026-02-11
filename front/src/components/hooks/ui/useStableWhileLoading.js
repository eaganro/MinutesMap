import { useEffect, useRef } from 'react';

/**
 * Preserve the last stable data/status while loading transitions are active.
 */
export function useStableWhileLoading({ data, statusMessage = null, isLoading, isBlurred }) {
  const isTransitionLoading = isLoading || isBlurred;
  const lastStableDataRef = useRef(data);
  const lastStableStatusRef = useRef(statusMessage);

  useEffect(() => {
    if (isTransitionLoading) {
      return;
    }
    lastStableDataRef.current = data;
  }, [data, isTransitionLoading]);

  useEffect(() => {
    if (isTransitionLoading) {
      return;
    }
    lastStableStatusRef.current = statusMessage;
  }, [statusMessage, isTransitionLoading]);

  return {
    displayData: isTransitionLoading ? lastStableDataRef.current : data,
    displayStatusMessage: isTransitionLoading ? lastStableStatusRef.current : statusMessage,
    isShowingStableData: isTransitionLoading,
  };
}
