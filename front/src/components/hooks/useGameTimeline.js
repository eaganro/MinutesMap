import { useMemo } from 'react';
import { timeToSeconds } from '../../helpers/utils';

function isProcessedPlayByPlayPayload(data) {
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
  Object.values(awayActions || {}).forEach((actions) => {
    if (actions && actions.length) allAct.push(...actions);
  });
  Object.values(homeActions || {}).forEach((actions) => {
    if (actions && actions.length) allAct.push(...actions);
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
    if (!isProcessedPlayByPlayPayload(playByPlay)) {
      return {
        scoreTimeline: [],
        homePlayerTimeline: {},
        awayPlayerTimeline: {},
        allActions: [],
        awayActions: {},
        homeActions: {},
      };
    }

    const allActions = playByPlay.allActions || buildAllActionsFromPlayers(playByPlay.awayActions, playByPlay.homeActions);
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
