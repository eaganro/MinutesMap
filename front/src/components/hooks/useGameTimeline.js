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
  const type = (a?.actionType || '').toString().toLowerCase();
  const desc = (a?.description || '').toString().toLowerCase();
  const result = (a?.result || a?.r || '').toString().toLowerCase();

  const isShotType =
    type === '2pt' ||
    type === '3pt' ||
    type === 'freethrow' ||
    type === 'free throw' ||
    type.includes('shot') ||
    desc.includes('free throw');

  const isMiss =
    result === 'x' ||
    result === 'miss' ||
    type.includes('miss') ||
    desc.includes('miss');

  const isMake = result === 'm' || result === 'make' || (isShotType && !isMiss);

  if (statOn[0] && isShotType && isMake) return true;
  if (statOn[1] && isShotType && isMiss) return true;
  if (statOn[2] && type.includes('rebound')) return true;
  if (statOn[3] && type.includes('assist')) return true;
  if (statOn[4] && type.includes('turnover')) return true;
  if (statOn[5] && type.includes('block')) return true;
  if (statOn[6] && type.includes('steal')) return true;
  if (statOn[7] && type.includes('foul')) return true;
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
    period: entry?.quarter ?? entry?.period,
    clock: entry?.time ?? entry?.clock,
    away: entry?.awayScore,
    home: entry?.homeScore,
  }));
}

function normalizeCompactTimeline(timelineMap) {
  if (!timelineMap || typeof timelineMap !== 'object') return {};
  return Object.fromEntries(
    Object.entries(timelineMap).map(([name, segments]) => [
      name,
      (segments || []).map((segment) => ({
        period: segment?.quarter ?? segment?.period,
        start: segment?.start,
        end: segment?.end,
      })),
    ])
  );
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
        homePlayerTimeline: normalizeCompactTimeline(playByPlay.segments?.home),
        awayPlayerTimeline: normalizeCompactTimeline(playByPlay.segments?.away),
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
