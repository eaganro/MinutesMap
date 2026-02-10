import { getSecondsElapsed } from '../../../helpers/playTimeline';

export function getCurrentActionIndex(allActions, highlightActionIds, descriptionArray) {
  if (!allActions || allActions.length === 0) return -1;
  const fallbackActionNumber = descriptionArray?.[0]?.actionNumber;
  const currentId = highlightActionIds?.[0] ?? fallbackActionNumber;
  if (currentId === null || currentId === undefined) return -1;
  return allActions.findIndex((action) => String(action.actionNumber) === String(currentId));
}

export function calculateTimelineXPosition({
  clock,
  period,
  timelineWindow,
  timelineWidth,
  leftMargin,
}) {
  if (!timelineWindow || timelineWindow.durationSeconds <= 0) {
    return leftMargin;
  }

  const elapsed = getSecondsElapsed(period, clock);
  const windowOffset = elapsed - timelineWindow.startSeconds;
  const ratio = windowOffset / timelineWindow.durationSeconds;
  const rawPos = Math.max(0, Math.min(timelineWidth, ratio * timelineWidth));
  return rawPos + leftMargin;
}

export function groupActionsByTimestamp(allActions, action) {
  if (!action) return [];
  return (allActions || []).filter(
    (entry) => entry.clock === action.clock && entry.period === action.period,
  );
}

export function getAdjacentAction(allActions, currentIndex, direction) {
  if (!allActions || allActions.length === 0 || currentIndex < 0) return null;
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
}

export function findClosestActionByPosition({
  allActions,
  rawPosition,
  leftMargin,
  calculateXPosition,
}) {
  if (!allActions || allActions.length === 0) return null;

  const position = Math.max(0, rawPosition);
  let actionIndex = 0;

  for (let i = 1; i < allActions.length; i += 1) {
    const currentActionX = calculateXPosition(allActions[i].clock, allActions[i].period);
    if (currentActionX - leftMargin > position) {
      break;
    }
    actionIndex = i;
  }

  return allActions[actionIndex] || null;
}

export function findActionMetaFromTarget(targetEl, containerEl) {
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
}
