import { useMemo } from 'react';
import { 
  sortActions, 
  filterActions, 
  processScoreTimeline, 
  createPlayers,
  createPlaytimes, 
  updatePlaytimesWithAction, 
  quarterChange, 
  endPlaytimes 
} from '../../helpers/dataProcessing';

/**
 * Hook for transforming raw play-by-play data into UI-ready timelines and actions.
 * Extracts heavy data processing logic from the view component.
 * 
 * @param {Array} playByPlay - Raw play-by-play data from the API
 * @param {number|null} homeTeamId - ID of the home team
 * @param {number|null} awayTeamId - ID of the away team
 * @param {Object|null} lastAction - The last action in the play-by-play data
 * @param {boolean[]} statOn - Array of stat filter toggles
 * @returns {Object} Processed timeline and action data
 */
export function useGameTimeline(playByPlay, homeTeamId, awayTeamId, lastAction, statOn) {
  return useMemo(() => {
    // Return empty defaults if no play data
    if (!playByPlay || playByPlay.length === 0) {
      return {
        scoreTimeline: [],
        homePlayerTimeline: [],
        awayPlayerTimeline: [],
        allActions: [],
        awayActions: [],
        homeActions: [],
      };
    }

    // Process score timeline
    const scoreTimeline = processScoreTimeline(playByPlay);

    // Create player action maps
    let { awayPlayers, homePlayers } = createPlayers(playByPlay, awayTeamId, homeTeamId);
    
    // Build playtime tracking
    let awayPlaytimes = createPlaytimes(awayPlayers);
    let homePlaytimes = createPlaytimes(homePlayers);

    // Process each action to update playtimes
    let currentQ = 1;
    playByPlay.forEach(a => {
      if (a.period !== currentQ) {
        awayPlaytimes = quarterChange(awayPlaytimes);
        homePlaytimes = quarterChange(homePlaytimes);
        currentQ = a.period;
      }
      if (a.teamId === awayTeamId) {
        awayPlaytimes = updatePlaytimesWithAction(a, awayPlaytimes);
      }
      if (a.teamId === homeTeamId) {
        homePlaytimes = updatePlaytimesWithAction(a, homePlaytimes);
      }
    });
    
    // Finalize playtimes with the last action
    homePlaytimes = endPlaytimes(homePlaytimes, lastAction);
    awayPlaytimes = endPlaytimes(awayPlaytimes, lastAction);

    // Collect all actions and filter by stat toggles
    let allAct = [];
    Object.entries(awayPlayers).forEach(([name, actions]) => {
      allAct = [...allAct, ...actions];
      awayPlayers[name] = awayPlayers[name].filter((a) => filterActions(a, statOn));
    });
    Object.entries(homePlayers).forEach(([name, actions]) => {
      allAct = [...allAct, ...actions];
      homePlayers[name] = homePlayers[name].filter((a) => filterActions(a, statOn));
    });
    allAct = sortActions(allAct);

    return {
      scoreTimeline,
      homePlayerTimeline: homePlaytimes,
      awayPlayerTimeline: awayPlaytimes,
      allActions: allAct,
      awayActions: awayPlayers,
      homeActions: homePlayers,
    };
  }, [playByPlay, homeTeamId, awayTeamId, lastAction, statOn]);
}

