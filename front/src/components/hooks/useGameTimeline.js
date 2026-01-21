import { useMemo } from 'react';
import { timeToSeconds } from '../../helpers/utils';

function isLegacyPlayByPlayPayload(data) {
  return (
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

function isCompactPlayByPlayPayload(data) {
  return (
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    data.v === 2 &&
    data.score &&
    data.players &&
    data.segments
  );
}

function filterActions(a, statOn) {
  const desc = a?.description || '';
  if (desc.includes('PTS') && statOn[0]) return true;
  if (desc.includes('MISS') && statOn[1]) return true;
  if (desc.includes('REBOUND') && statOn[2]) return true;
  if (a?.actionType === 'Assist' && statOn[3]) return true;
  if (desc.includes('TO)') && statOn[4]) return true;
  if (desc.includes('BLK') && statOn[5]) return true;
  if (desc.includes('STL') && statOn[6]) return true;
  if (desc.includes('PF)') && statOn[7]) return true;
  return false;
}

function sortActions(actions) {
  return (actions || []).slice().sort((a, b) => {
    if (a.period < b.period) return -1;
    if (a.period > b.period) return 1;
    if (timeToSeconds(a.clock) > timeToSeconds(b.clock)) return -1;
    return 1;
  });
}

function buildAllActionsFromPlayers(awayActions, homeActions) {
  const allAct = [];
  const withSide = (action, side) => {
    if (!action) return action;
    if (action.side) return action;
    return { ...action, side };
  };
  Object.values(awayActions || {}).forEach((actions) => {
    if (!actions || !actions.length) return;
    actions.forEach((action) => allAct.push(withSide(action, 'away')));
  });
  Object.values(homeActions || {}).forEach((actions) => {
    if (!actions || !actions.length) return;
    actions.forEach((action) => allAct.push(withSide(action, 'home')));
  });
  return sortActions(allAct);
}

function filterPlayerActions(playerMap, statOn) {
  if (!playerMap || typeof playerMap !== 'object') return {};
  return Object.fromEntries(
    Object.entries(playerMap).map(([name, actions]) => [
      name,
      (actions || []).filter((a) => filterActions(a, statOn)),
    ])
  );
}

function normalizeCompactAction(action, side) {
  if (!action || typeof action !== 'object') return null;
  return {
    period: action.period,
    clock: action.clock,
    actionType: action.type,
    description: action.text,
    subType: action.detail,
    actionNumber: action.seq,
    actionId: action.id,
    scoreAway: action.awayScore,
    scoreHome: action.homeScore,
    side,
  };
}

function normalizeCompactActionMap(playerMap, side) {
  if (!playerMap || typeof playerMap !== 'object') return {};
  return Object.fromEntries(
    Object.entries(playerMap).map(([name, actions]) => [
      name,
      (actions || [])
        .map((action) => normalizeCompactAction(action, side))
        .filter(Boolean),
    ])
  );
}

function normalizeCompactScoreTimeline(scoreTimeline) {
  return (scoreTimeline || []).map((entry) => ({
    period: entry?.period,
    clock: entry?.clock,
    away: entry?.awayScore,
    home: entry?.homeScore,
  }));
}

/**
 * Hook for transforming raw play-by-play data into UI-ready timelines and actions.
 * Extracts heavy data processing logic from the view component.
 * 
 * @param {Array|Object} playByPlay - Raw play-by-play array OR pre-processed payload from S3
 * @param {number|null} homeTeamId - ID of the home team
 * @param {number|null} awayTeamId - ID of the away team
 * @param {Object|null} lastAction - The last action in the play-by-play data
 * @param {boolean[]} statOn - Array of stat filter toggles
 * @returns {Object} Processed timeline and action data
 */
export function useGameTimeline(playByPlay, homeTeamId, awayTeamId, lastAction, statOn) {
  return useMemo(() => {
    if (!isLegacyPlayByPlayPayload(playByPlay) && !isCompactPlayByPlayPayload(playByPlay)) {
      return {
        scoreTimeline: [],
        homePlayerTimeline: {},
        awayPlayerTimeline: {},
        allActions: [],
        awayActions: {},
        homeActions: {},
      };
    }

    if (isCompactPlayByPlayPayload(playByPlay)) {
      const awayActions = normalizeCompactActionMap(playByPlay.players?.away, 'away');
      const homeActions = normalizeCompactActionMap(playByPlay.players?.home, 'home');
      const allActions = buildAllActionsFromPlayers(awayActions, homeActions);
      return {
        scoreTimeline: normalizeCompactScoreTimeline(playByPlay.score),
        homePlayerTimeline: playByPlay.segments?.home || {},
        awayPlayerTimeline: playByPlay.segments?.away || {},
        allActions,
        awayActions: filterPlayerActions(awayActions, statOn),
        homeActions: filterPlayerActions(homeActions, statOn),
      };
    }

    const allActions = buildAllActionsFromPlayers(playByPlay.awayActions, playByPlay.homeActions);
    return {
      scoreTimeline: playByPlay.scoreTimeline || [],
      homePlayerTimeline: playByPlay.homePlayerTimeline || {},
      awayPlayerTimeline: playByPlay.awayPlayerTimeline || {},
      allActions,
      awayActions: filterPlayerActions(playByPlay.awayActions, statOn),
      homeActions: filterPlayerActions(playByPlay.homeActions, statOn),
    };
  }, [playByPlay, statOn]);
}
