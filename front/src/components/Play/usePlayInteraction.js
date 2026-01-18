import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSecondsElapsed } from '../../helpers/playTimeline';
import { getEventType } from '../../helpers/eventStyles.jsx';

export const usePlayInteraction = ({
  allActions,
  leftMargin,
  timelineWidth,
  timelineWindow,
  playRef // We need the ref to calculate mouse offsets correctly
}) => {
  const [descriptionArray, setDescriptionArray] = useState([]);
  const [mouseLinePos, setMouseLinePos] = useState(null);
  const [highlightActionIds, setHighlightActionIds] = useState([]);
  const [infoLocked, setInfoLocked] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const getCurrentActionIndex = useCallback(() => {
    if (!allActions || allActions.length === 0) return -1;
    const fallbackActionNumber = descriptionArray[0]?.actionNumber;
    const currentId = highlightActionIds[0] ?? fallbackActionNumber;
    if (currentId === null || currentId === undefined) return -1;
    return allActions.findIndex((a) => String(a.actionNumber) === String(currentId));
  }, [allActions, highlightActionIds, descriptionArray]);

  // HELPER: Calculate X Position on Timeline
  const calculateXPosition = useCallback((clock, period) => {
    if (!timelineWindow || timelineWindow.durationSeconds <= 0) {
      return leftMargin;
    }
    const elapsed = getSecondsElapsed(period, clock);
    const windowOffset = elapsed - timelineWindow.startSeconds;
    const ratio = windowOffset / timelineWindow.durationSeconds;
    const rawPos = Math.max(0, Math.min(timelineWidth, ratio * timelineWidth));
    return rawPos + leftMargin;
  }, [timelineWindow, timelineWidth, leftMargin]);

  const applyActionSelection = useCallback((action) => {
    if (!action) return false;
    const sameTimeActions = allActions.filter((a) =>
      a.clock === action.clock && a.period === action.period
    );
    const newActionIds = sameTimeActions.map((a) => a.actionNumber);
    const newX = calculateXPosition(action.clock, action.period);
    setHighlightActionIds(newActionIds);
    setDescriptionArray(sameTimeActions);
    setMouseLinePos(newX);
    return true;
  }, [allActions, calculateXPosition]);

  const getAdjacentAction = useCallback((direction) => {
    if (!allActions || allActions.length === 0) return null;
    const currentIndex = getCurrentActionIndex();
    if (currentIndex < 0) return null;
    const currentAction = allActions[currentIndex];
    let newIndex = currentIndex + direction;
    while (
      newIndex >= 0 &&
      newIndex < allActions.length &&
      allActions[newIndex].clock === currentAction.clock &&
      allActions[newIndex].period === currentAction.period
    ) {
      newIndex += direction;
    }
    if (newIndex < 0 || newIndex >= allActions.length) return null;
    return allActions[newIndex];
  }, [allActions, getCurrentActionIndex]);

  const navigateAction = useCallback((direction) => {
    const nextAction = getAdjacentAction(direction);
    return applyActionSelection(nextAction);
  }, [getAdjacentAction, applyActionSelection]);

  const hasPrevAction = useMemo(() => Boolean(getAdjacentAction(-1)), [getAdjacentAction]);
  const hasNextAction = useMemo(() => Boolean(getAdjacentAction(1)), [getAdjacentAction]);

  // LOGIC: Keyboard Navigation (Left/Right Arrows)
  useEffect(() => {
    if (!infoLocked || !allActions || allActions.length === 0) return;

    const handleKeyDown = (ev) => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      ev.preventDefault();
      const direction = ev.key === 'ArrowLeft' ? -1 : 1;
      navigateAction(direction);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [infoLocked, allActions, navigateAction]);

  // LOGIC: Click Outside to Close
  useEffect(() => {
    const handleOutside = (ev) => {
      if (!infoLocked) return;
      const container = playRef.current;
      if (!container) return;
      
      // If clicking outside the container, reset everything
      if (!container.contains(ev.target)) {
        setInfoLocked(false);
        setMouseLinePos(null);
        setDescriptionArray([]);
        setHighlightActionIds([]);
      }
    };
    
    document.addEventListener('mousedown', handleOutside, { passive: true });
    document.addEventListener('touchstart', handleOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [infoLocked, playRef]);

  // LOGIC: Main Hover Handler
  const updateHoverAt = useCallback((clientX, clientY, targetEl, force = false) => {
    if ((infoLocked && !force) || !playRef.current) return;

    // Calculate position relative to the play container
    const rect = playRef.current.getBoundingClientRect();
    const rawPos = clientX - rect.left - leftMargin;
    const width = timelineWidth;

    // Update global mouse position for tooltip placement
    setMousePosition({ x: clientX, y: clientY });

    // Tolerance check (if mouse drifted too far left/right)
    const hoverPadding = 5;
    if (rawPos < -hoverPadding || rawPos > width + hoverPadding) {
      setMouseLinePos(null);
      setDescriptionArray([]);
      setHighlightActionIds([]);
      return;
    }

    // Clamp position for calculation
    let pos = Math.max(0, Math.min(rawPos, width));

    // Check for direct hover on a specific shape/icon
    let hoveredActionNumber = null;
    let hoveredActionId = null;
    let checkEl = targetEl;
    
    // Traverse up to find data-action-number (handles SVG nesting)
    while (checkEl && (hoveredActionNumber === null && hoveredActionId === null) && checkEl !== playRef.current) {
      if (checkEl.dataset) {
        if (checkEl.dataset.actionNumber) {
          hoveredActionNumber = checkEl.dataset.actionNumber;
        }
        if (checkEl.dataset.actionId) {
          hoveredActionId = checkEl.dataset.actionId;
        }
      }
      if (checkEl.tagName === 'svg') break; // Optimization boundary
      checkEl = checkEl.parentElement;
    }

    if (hoveredActionNumber !== null || hoveredActionId !== null) {
      let hoveredAction = null;
      if (hoveredActionId !== null) {
        hoveredAction = allActions.find(a => String(a.actionId) === String(hoveredActionId));
      }
      if (!hoveredAction && hoveredActionNumber !== null) {
        hoveredAction = allActions.find(a => String(a.actionNumber) === String(hoveredActionNumber));
      }
      
      if (hoveredAction) {
        const eventType = getEventType(hoveredAction.description, hoveredAction.actionType);
        const isFreeThrow = hoveredAction.description.includes('Free Throw') || hoveredAction.description.includes('FT');

        let hoverActions = [hoveredAction];
        
        // Special case: Group Points and Free Throws visually
        if (eventType === 'point' || isFreeThrow) {
          hoverActions = allActions.filter(a => 
            a.clock === hoveredAction.clock && 
            a.period === hoveredAction.period &&
            (getEventType(a.description, a.actionType) === 'point' || a.description.includes('Free Throw') || a.description.includes('FT'))
          );
        }

        const hoverIds = hoverActions.map(a => a.actionNumber);
        const actionX = calculateXPosition(hoveredAction.clock, hoveredAction.period);

        setHighlightActionIds(hoverIds);
        setDescriptionArray(hoverActions);
        setMouseLinePos(actionX);
        return; // Exit early if we found a direct target
      }
    }

    // Fallback: Find closest action by X-Axis position
    // Iterate to find where the mouse `pos` lands in the timeline
    let actionIndex = 0;
    let found = false;
    
    for (let i = 1; i < allActions.length && !found; i++) {
      const currentActionX = calculateXPosition(allActions[i].clock, allActions[i].period);
      
      // Adjust comparison to account for leftMargin
      if ((currentActionX - leftMargin) > pos) {
        found = true;
      } else {
        // Check if time is identical to previous, group them
        actionIndex = i;
      }
    }

    const matchedAction = allActions[actionIndex];
    if (matchedAction) {
        // Collect all actions occurring at this exact timestamp
        const sameTimeActions = allActions.filter(a => 
            a.clock === matchedAction.clock && a.period === matchedAction.period
        );
        
        const sameTimeIds = sameTimeActions.map(a => a.actionNumber);

        setHighlightActionIds(sameTimeIds);
        setDescriptionArray(sameTimeActions);
        setMouseLinePos(pos + leftMargin);
    }
  }, [
    infoLocked, 
    playRef, 
    leftMargin, 
    timelineWidth, 
    allActions, 
    calculateXPosition
  ]);

  // Exposed Reset Function
  const resetInteraction = useCallback((force = false) => {
    if (!infoLocked || force) {
      setMouseLinePos(null);
      setDescriptionArray([]);
      setHighlightActionIds([]);
    }
  }, [infoLocked]);

  return {
    descriptionArray,
    mouseLinePos,
    highlightActionIds,
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
    resetInteraction
  };
};
