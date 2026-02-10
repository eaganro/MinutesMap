import { useCallback, useEffect, useRef, useState } from 'react';
import { buildNbaEventUrl, resolveVideoAction } from '../../../helpers/nbaEvents';
import { useTrackFeatureUseOnce } from '../../hooks/useTrackFeatureUseOnce';

const TOUCH_AXIS_LOCK_PX = 8;

const findActionMetaFromTarget = (targetEl, containerEl) => {
  let checkEl = targetEl;
  while (checkEl && checkEl !== containerEl) {
    if (checkEl.dataset) {
      const actionNumber = checkEl.dataset.actionNumber ?? null;
      if (actionNumber) {
        return { actionNumber };
      }
    }
    if (checkEl.tagName === 'svg') break;
    checkEl = checkEl.parentElement;
  }
  return null;
};

export function usePlayPointerHandlers({
  playRef,
  nbaGameId,
  displayAllActions,
  isDataLoading,
  infoLocked,
  descriptionArray,
  setInfoLocked,
  setMousePosition,
  updateHoverAt,
  resetInteraction,
}) {
  const touchStartRef = useRef({ x: 0, y: 0 });
  const touchAxisRef = useRef(null);
  const touchMovedRef = useRef(false);
  const touchClickGuardUntilRef = useRef(0);
  const trackPlayFeatureUse = useTrackFeatureUseOnce('play-by-play');
  const [isHoveringIcon, setIsHoveringIcon] = useState(false);
  const [canOpenVideoOnClick, setCanOpenVideoOnClick] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(hover: hover) and (pointer: fine)').matches
      : true,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return undefined;
    }
    const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    const handleChange = (event) => setCanOpenVideoOnClick(event.matches);

    setCanOpenVideoOnClick(mediaQuery.matches);
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  const handleMouseMove = useCallback(
    (e) => {
      const actionMeta = findActionMetaFromTarget(e.target, playRef.current);
      setIsHoveringIcon(Boolean(actionMeta?.actionNumber));
      updateHoverAt(e.clientX, e.clientY, e.target);
    },
    [playRef, updateHoverAt],
  );

  const handleMouseLeave = useCallback(() => {
    setIsHoveringIcon(false);
    resetInteraction();
  }, [resetInteraction]);

  const handleClick = useCallback(
    (e) => {
      if (Date.now() < touchClickGuardUntilRef.current) {
        return;
      }
      trackPlayFeatureUse();
      const actionMeta = findActionMetaFromTarget(e.target, playRef.current);
      const actionNumber = actionMeta?.actionNumber ?? null;

      if (actionNumber && canOpenVideoOnClick) {
        const action = (displayAllActions || []).find(
          (entry) => String(entry.actionNumber) === String(actionNumber),
        );
        const targetAction = resolveVideoAction(action, displayAllActions);
        const url = buildNbaEventUrl({
          gameId: nbaGameId,
          actionNumber: targetAction?.actionNumber ?? action?.actionNumber ?? actionNumber,
          description: targetAction?.description ?? action?.description,
        });
        if (url && typeof window !== 'undefined') {
          window.open(url, '_blank', 'noopener');
          return;
        }
      }

      if (!infoLocked) {
        setInfoLocked(true);
        setMousePosition({ x: e.clientX, y: e.clientY });
      } else {
        setInfoLocked(false);
        if (!canOpenVideoOnClick) {
          resetInteraction(true);
        } else {
          resetInteraction();
        }
      }
    },
    [
      trackPlayFeatureUse,
      playRef,
      canOpenVideoOnClick,
      displayAllActions,
      nbaGameId,
      infoLocked,
      setInfoLocked,
      setMousePosition,
      resetInteraction,
    ],
  );

  const handleTouchStart = useCallback(
    (e) => {
      if (isDataLoading || !e.touches[0]) return;
      trackPlayFeatureUse();
      touchAxisRef.current = null;
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      touchMovedRef.current = false;
      resetInteraction();
    },
    [isDataLoading, trackPlayFeatureUse, resetInteraction],
  );

  const handleTouchMove = useCallback(
    (e) => {
      if (isDataLoading || !e.touches[0]) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (!touchAxisRef.current) {
        if (absDx < TOUCH_AXIS_LOCK_PX && absDy < TOUCH_AXIS_LOCK_PX) {
          return;
        }
        touchAxisRef.current = absDx >= absDy ? 'horizontal' : 'vertical';
        touchMovedRef.current = true;
      }

      if (touchAxisRef.current === 'vertical') {
        if (!infoLocked) {
          resetInteraction();
        }
        return;
      }

      const wasLocked = infoLocked;
      if (wasLocked) {
        setInfoLocked(false);
      }
      touchMovedRef.current = true;
      e.preventDefault();
      updateHoverAt(touch.clientX, touch.clientY, e.target, wasLocked);
    },
    [isDataLoading, infoLocked, resetInteraction, setInfoLocked, updateHoverAt],
  );

  const handleTouchEnd = useCallback(() => {
    if (isDataLoading) return;
    if (touchMovedRef.current) {
      const shouldLock = touchAxisRef.current === 'horizontal' && descriptionArray.length > 0;
      touchClickGuardUntilRef.current = Date.now() + 200;
      if (!infoLocked) {
        if (shouldLock) {
          setInfoLocked(true);
        } else {
          resetInteraction();
        }
      }
    }
    touchAxisRef.current = null;
    touchMovedRef.current = false;
  }, [isDataLoading, descriptionArray.length, infoLocked, setInfoLocked, resetInteraction]);

  const handleTouchCancel = useCallback(() => {
    if (isDataLoading) return;
    touchClickGuardUntilRef.current = Date.now() + 200;
    if (!infoLocked) {
      resetInteraction();
    }
    touchAxisRef.current = null;
    touchMovedRef.current = false;
  }, [isDataLoading, infoLocked, resetInteraction]);

  const clearHoverIcon = useCallback(() => {
    setIsHoveringIcon(false);
  }, []);

  return {
    isHoveringIcon,
    clearHoverIcon,
    handleMouseMove,
    handleMouseLeave,
    handleClick,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
  };
}
