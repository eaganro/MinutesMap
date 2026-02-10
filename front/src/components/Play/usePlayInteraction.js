import { useState, useEffect, useCallback, useMemo } from 'react';
import { getEventType, isFreeThrowAction } from '../../domain/events/classification';
import {
  calculateTimelineXPosition,
  findClosestActionByPosition,
  getAdjacentAction as resolveAdjacentAction,
  getCurrentActionIndex as resolveCurrentActionIndex,
  groupActionsByTimestamp,
} from './model/interactionModel';

export const usePlayInteraction = ({
  allActions,
  leftMargin,
  timelineWidth,
  timelineWindow,
  playRef,
}) => {
  const [descriptionArray, setDescriptionArray] = useState([]);
  const [mouseLinePos, setMouseLinePos] = useState(null);
  const [highlightActionIds, setHighlightActionIds] = useState([]);
  const [infoLocked, setInfoLocked] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [focusActionMeta, setFocusActionMeta] = useState(null);

  const getCurrentActionIndex = useCallback(
    () => resolveCurrentActionIndex(allActions, highlightActionIds, descriptionArray),
    [allActions, highlightActionIds, descriptionArray],
  );

  const calculateXPosition = useCallback(
    (clock, period) =>
      calculateTimelineXPosition({
        clock,
        period,
        timelineWindow,
        timelineWidth,
        leftMargin,
      }),
    [timelineWindow, timelineWidth, leftMargin],
  );

  const applyActionSelection = useCallback(
    (action) => {
      if (!action) return false;
      const sameTimeActions = groupActionsByTimestamp(allActions, action);
      const newActionIds = sameTimeActions.map((entry) => entry.actionNumber);
      const newX = calculateXPosition(action.clock, action.period);
      setHighlightActionIds(newActionIds);
      setDescriptionArray(sameTimeActions);
      setMouseLinePos(newX);
      setFocusActionMeta({
        actionNumber: action.actionNumber ?? null,
      });
      return true;
    },
    [allActions, calculateXPosition],
  );

  const getAdjacentAction = useCallback(
    (direction) => {
      const currentIndex = getCurrentActionIndex();
      return resolveAdjacentAction(allActions, currentIndex, direction);
    },
    [allActions, getCurrentActionIndex],
  );

  const navigateAction = useCallback(
    (direction) => {
      const nextAction = getAdjacentAction(direction);
      return applyActionSelection(nextAction);
    },
    [getAdjacentAction, applyActionSelection],
  );

  const hasPrevAction = useMemo(() => Boolean(getAdjacentAction(-1)), [getAdjacentAction]);
  const hasNextAction = useMemo(() => Boolean(getAdjacentAction(1)), [getAdjacentAction]);

  const closeLockedTooltip = useCallback(() => {
    setInfoLocked(false);
    setMouseLinePos(null);
    setDescriptionArray([]);
    setHighlightActionIds([]);
  }, [setInfoLocked, setMouseLinePos, setDescriptionArray, setHighlightActionIds]);

  useEffect(() => {
    if (!infoLocked) return;

    const handleKeyDown = (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        closeLockedTooltip();
        return;
      }
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      if (!allActions || allActions.length === 0) return;
      ev.preventDefault();
      const direction = ev.key === 'ArrowLeft' ? -1 : 1;
      navigateAction(direction);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [infoLocked, allActions, navigateAction, closeLockedTooltip]);

  useEffect(() => {
    const handleOutside = (ev) => {
      if (!infoLocked) return;
      const container = playRef.current;
      if (!container) return;

      if (!container.contains(ev.target)) {
        closeLockedTooltip();
      }
    };

    document.addEventListener('mousedown', handleOutside, { passive: true });
    document.addEventListener('touchstart', handleOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [infoLocked, playRef, closeLockedTooltip]);

  const updateHoverAt = useCallback(
    (clientX, clientY, targetEl, force = false) => {
      if ((infoLocked && !force) || !playRef.current) return;

      const rect = playRef.current.getBoundingClientRect();
      const rawPos = clientX - rect.left - leftMargin;
      const width = timelineWidth;

      setMousePosition({ x: clientX, y: clientY });

      const hoverPadding = 5;
      if (rawPos < -hoverPadding || rawPos > width + hoverPadding) {
        setMouseLinePos(null);
        setDescriptionArray([]);
        setHighlightActionIds([]);
        setFocusActionMeta(null);
        return;
      }

      const pos = Math.max(0, Math.min(rawPos, width));

      let hoveredActionNumber = null;
      let checkEl = targetEl;
      while (checkEl && hoveredActionNumber === null && checkEl !== playRef.current) {
        if (checkEl.dataset?.actionNumber) {
          hoveredActionNumber = checkEl.dataset.actionNumber;
        }
        if (checkEl.tagName === 'svg') break;
        checkEl = checkEl.parentElement;
      }

      if (hoveredActionNumber !== null) {
        const hoveredAction = (allActions || []).find(
          (action) => String(action.actionNumber) === String(hoveredActionNumber),
        );

        if (hoveredAction) {
          const eventType = getEventType(
            hoveredAction.description,
            hoveredAction.actionType,
            hoveredAction.result,
          );
          const isFreeThrow = isFreeThrowAction(
            hoveredAction.description,
            hoveredAction.actionType,
          );

          let hoverActions = [hoveredAction];
          if (eventType === 'point' || isFreeThrow) {
            hoverActions = (allActions || []).filter(
              (action) =>
                action.clock === hoveredAction.clock &&
                action.period === hoveredAction.period &&
                (getEventType(action.description, action.actionType, action.result) === 'point' ||
                  isFreeThrowAction(action.description, action.actionType)),
            );
          }

          const hoverIds = hoverActions.map((entry) => entry.actionNumber);
          const actionX = calculateXPosition(hoveredAction.clock, hoveredAction.period);

          setHighlightActionIds(hoverIds);
          setDescriptionArray(hoverActions);
          setMouseLinePos(actionX);
          setFocusActionMeta({
            actionNumber: hoveredAction.actionNumber ?? null,
          });
          return;
        }
      }

      const matchedAction = findClosestActionByPosition({
        allActions,
        rawPosition: pos,
        leftMargin,
        calculateXPosition,
      });

      if (matchedAction) {
        const sameTimeActions = groupActionsByTimestamp(allActions, matchedAction);
        const sameTimeIds = sameTimeActions.map((action) => action.actionNumber);

        setHighlightActionIds(sameTimeIds);
        setDescriptionArray(sameTimeActions);
        setMouseLinePos(pos + leftMargin);
        setFocusActionMeta({
          actionNumber: matchedAction.actionNumber ?? null,
        });
      } else {
        setFocusActionMeta(null);
      }
    },
    [infoLocked, playRef, leftMargin, timelineWidth, allActions, calculateXPosition],
  );

  const resetInteraction = useCallback(
    (force = false) => {
      if (!infoLocked || force) {
        setMouseLinePos(null);
        setDescriptionArray([]);
        setHighlightActionIds([]);
        setFocusActionMeta(null);
      }
    },
    [infoLocked],
  );

  return {
    descriptionArray,
    mouseLinePos,
    highlightActionIds,
    focusActionMeta,
    infoLocked,
    hasPrevAction,
    hasNextAction,
    navigateAction,
    setInfoLocked,
    mousePosition,
    setMousePosition,
    setMouseLinePos,
    setDescriptionArray,
    setHighlightActionIds,
    updateHoverAt,
    resetInteraction,
  };
};
