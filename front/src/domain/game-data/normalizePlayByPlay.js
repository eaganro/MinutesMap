import { sortActions } from './filterActions';

export const EMPTY_TIMELINE_DATA = Object.freeze({
  scoreTimeline: [],
  homePlayerTimeline: {},
  awayPlayerTimeline: {},
  allActions: [],
  awayActionsAll: {},
  homeActionsAll: {},
  captions: null,
});

export function isLegacyPlayByPlayPayload(data) {
  return !!(
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    data.schemaVersion === 1 &&
    data.scoreTimeline &&
    data.awayActions &&
    data.homeActions &&
    data.awayPlayerTimeline &&
    data.homePlayerTimeline
  );
}

export function isCompactPlayByPlayPayload(data) {
  return !!(
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    data.v === 2 &&
    data.score &&
    data.players &&
    data.segments
  );
}

export function normalizeCompactAction(action, side) {
  if (!action || typeof action !== 'object') return null;
  return {
    period: action.quarter ?? action.period,
    clock: action.time ?? action.clock,
    actionType: action.type,
    description: action.text,
    result: action.r ?? action.result,
    subType: action.detail,
    actionNumber: action.seq,
    scoreAway: action.awayScore,
    scoreHome: action.homeScore,
    side,
  };
}

export function normalizeCompactActionMap(playerMap, side) {
  if (!playerMap || typeof playerMap !== 'object') return {};
  return Object.fromEntries(
    Object.entries(playerMap).map(([name, actions]) => [
      name,
      (actions || []).map((action) => normalizeCompactAction(action, side)).filter(Boolean),
    ]),
  );
}

export function normalizeCompactScoreTimeline(scoreTimeline) {
  return (scoreTimeline || []).map((entry) => ({
    period: entry?.quarter ?? entry?.period,
    clock: entry?.time ?? entry?.clock,
    away: entry?.awayScore,
    home: entry?.homeScore,
  }));
}

export function normalizeCompactTimeline(timelineMap) {
  if (!timelineMap || typeof timelineMap !== 'object') return {};
  return Object.fromEntries(
    Object.entries(timelineMap).map(([name, segments]) => [
      name,
      (segments || []).map((segment) => ({
        period: segment?.quarter ?? segment?.period,
        start: segment?.start,
        end: segment?.end,
      })),
    ]),
  );
}

export function buildAllActionsFromPlayers(awayActions, homeActions) {
  const allActions = [];
  const withSide = (action, side) => {
    if (!action) return action;
    if (action.side) return action;
    return { ...action, side };
  };

  Object.values(awayActions || {}).forEach((actions) => {
    if (!actions || !actions.length) return;
    actions.forEach((action) => allActions.push(withSide(action, 'away')));
  });

  Object.values(homeActions || {}).forEach((actions) => {
    if (!actions || !actions.length) return;
    actions.forEach((action) => allActions.push(withSide(action, 'home')));
  });

  return sortActions(allActions);
}

export function normalizePlayByPlay(playByPlay) {
  if (!isLegacyPlayByPlayPayload(playByPlay) && !isCompactPlayByPlayPayload(playByPlay)) {
    return EMPTY_TIMELINE_DATA;
  }

  if (isCompactPlayByPlayPayload(playByPlay)) {
    const awayActionsAll = normalizeCompactActionMap(playByPlay.players?.away, 'away');
    const homeActionsAll = normalizeCompactActionMap(playByPlay.players?.home, 'home');
    return {
      scoreTimeline: normalizeCompactScoreTimeline(playByPlay.score),
      homePlayerTimeline: normalizeCompactTimeline(playByPlay.segments?.home),
      awayPlayerTimeline: normalizeCompactTimeline(playByPlay.segments?.away),
      allActions: buildAllActionsFromPlayers(awayActionsAll, homeActionsAll),
      awayActionsAll,
      homeActionsAll,
      captions:
        playByPlay?.captions && typeof playByPlay.captions === 'object' ? playByPlay.captions : null,
    };
  }

  const awayActionsAll = playByPlay.awayActions || {};
  const homeActionsAll = playByPlay.homeActions || {};

  return {
    scoreTimeline: playByPlay.scoreTimeline || [],
    homePlayerTimeline: playByPlay.homePlayerTimeline || {},
    awayPlayerTimeline: playByPlay.awayPlayerTimeline || {},
    allActions: buildAllActionsFromPlayers(awayActionsAll, homeActionsAll),
    awayActionsAll,
    homeActionsAll,
    captions: null,
  };
}
