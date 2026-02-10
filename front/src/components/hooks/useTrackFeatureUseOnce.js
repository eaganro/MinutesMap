import { useCallback, useRef } from 'react';
import { trackFeatureUse } from '../../helpers/analytics';

/**
 * Returns a callback that tracks a feature only on first invocation.
 */
export function useTrackFeatureUseOnce(featureName, defaultData = undefined) {
  const hasTrackedRef = useRef(false);

  return useCallback(
    (data = defaultData) => {
      if (hasTrackedRef.current || !featureName) {
        return false;
      }
      hasTrackedRef.current = true;
      trackFeatureUse(featureName, data);
      return true;
    },
    [featureName, defaultData],
  );
}
