import { useState, useEffect, useCallback, useMemo } from 'react';
import { getEventType, isFreeThrowAction } from '../../domain/events/classification';
import { findWinProbabilityAtOrBefore } from '../../helpers/odds';
import { getSecondsElapsed } from '../../helpers/playTimeline';
import {
  calculateTimelineXPosition,
  findClosestActionByPosition,
  findNearestActionByPosition,
  getAdjacentAction as resolveAdjacentAction,
  getCurrentActionIndex as resolveCurrentActionIndex,
  groupActionsByTimestamp,
} from './model/interactionModel';

export const usePlayInteraction = ({
  allActions,
  // A highlighted player's events, in order: hovering snaps to these and Previous/Next
  // steps through them. Null when no one is highlighted.
  focusActions = null,
  oddsTimeline,
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

  const isFocused = Array.isArray(focusActions);
  // What hovering snaps to and Previous/Next steps through.
  const navActions = isFocused ? focusActions : allActions;
  const navActionNumbers = useMemo(
    () => (isFocused ? new Set(focusActions.map((action) => String(action.actionNumber))) : null),
    [isFocused, focusActions],
  );
  const navElapsed = useMemo(
    () =>
      isFocused ? focusActions.map((action) => getSecondsElapsed(action.period, action.clock)) : [],
    [isFocused, focusActions],
  );

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

  const buildFocusActionMeta = useCallback(
    (action) => {
      if (!action) return null;

      return {
        actionNumber: action.actionNumber ?? null,
        awayWinProb: findWinProbabilityAtOrBefore(oddsTimeline, action.period, action.clock),
      };
    },
    [oddsTimeline],
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
      setFocusActionMeta(buildFocusActionMeta(action));
      return true;
    },
    [allActions, calculateXPosition, buildFocusActionMeta],
  );

  const getAdjacentAction = useCallback(
    (direction) => {
      if (isFocused) {
        // By time, so it also works from a moment that isn't one of theirs.
        const current = descriptionArray[0];
        if (!current) return null;
        const currentElapsed = getSecondsElapsed(current.period, current.clock);
        if (direction > 0) {
          const index = navElapsed.findIndex((elapsed) => elapsed > currentElapsed);
          return index >= 0 ? focusActions[index] : null;
        }
        for (let index = navElapsed.length - 1; index >= 0; index -= 1) {
          if (navElapsed[index] < currentElapsed) return focusActions[index];
        }
        return null;
      }
      const currentIndex = getCurrentActionIndex();
      return resolveAdjacentAction(allActions, currentIndex, direction);
    },
    [isFocused, descriptionArray, navElapsed, focusActions, allActions, getCurrentActionIndex],
  );

  const navigateAction = useCallback(
    (direction) => {
      const nextAction = getAdjacentAction(direction);
      return applyActionSelection(nextAction);
    },
    [getAdjacentAction, applyActionSelection],
  );

  const selectBoundaryAction = useCallback(
    (boundary) => {
      if (!navActions?.length) return false;
      const action = boundary === 'last' ? navActions[navActions.length - 1] : navActions[0];
      return applyActionSelection(action);
    },
    [navActions, applyActionSelection],
  );

  const hasPrevAction = useMemo(() => Boolean(getAdjacentAction(-1)), [getAdjacentAction]);
  const hasNextAction = useMemo(() => Boolean(getAdjacentAction(1)), [getAdjacentAction]);

  // A pinned tooltip with nothing in it would only block hovering, so let it go.
  useEffect(() => {
    if (infoLocked && descriptionArray.length === 0) setInfoLocked(false);
  }, [infoLocked, descriptionArray.length]);

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
      if (!navActions || navActions.length === 0) return;
      ev.preventDefault();
      const direction = ev.key === 'ArrowLeft' ? -1 : 1;
      navigateAction(direction);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [infoLocked, navActions, navigateAction, closeLockedTooltip]);

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

        // With a player highlighted, only their own markers catch the cursor.
        const isNavAction = !navActionNumbers || navActionNumbers.has(String(hoveredActionNumber));
        if (hoveredAction && isNavAction) {
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
          setFocusActionMeta(buildFocusActionMeta(hoveredAction));
          return;
        }
      }

      // A highlighted player's nearest event either side of the cursor; otherwise the
      // latest play at or before it.
      const matchedAction = isFocused
        ? findNearestActionByPosition({
            actions: navActions,
            rawPosition: pos,
            leftMargin,
            calculateXPosition,
          })
        : findClosestActionByPosition({
            allActions: navActions,
            rawPosition: pos,
            leftMargin,
            calculateXPosition,
          });

      if (matchedAction) {
        const sameTimeActions = groupActionsByTimestamp(allActions, matchedAction);
        const sameTimeIds = sameTimeActions.map((action) => action.actionNumber);

        setHighlightActionIds(sameTimeIds);
        setDescriptionArray(sameTimeActions);
        // A highlighted player's events pull the cursor line onto them.
        setMouseLinePos(
          isFocused
            ? calculateXPosition(matchedAction.clock, matchedAction.period)
            : pos + leftMargin,
        );
        setFocusActionMeta(buildFocusActionMeta(matchedAction));
      } else {
        setFocusActionMeta(null);
      }
    },
    [
      infoLocked,
      playRef,
      leftMargin,
      timelineWidth,
      allActions,
      navActions,
      navActionNumbers,
      isFocused,
      calculateXPosition,
      buildFocusActionMeta,
    ],
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
    selectBoundaryAction,
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
