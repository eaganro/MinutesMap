import { useMemo } from 'react';
import {
  getGameTotalSeconds,
  getPeriodDurationSeconds,
  getPeriodStartSeconds,
  getSecondsElapsed,
} from '../../../helpers/playTimeline';

export function usePeriodFilteredData({ activePeriod, numPeriods, stablePlayData }) {
  const stableAllActions = stablePlayData.allActions;
  const stableScoreTimeline = stablePlayData.scoreTimeline;
  const stableOddsTimeline = stablePlayData.oddsTimeline;
  const stableAwayPlayers = stablePlayData.playerActions.away.filtered;
  const stableHomePlayers = stablePlayData.playerActions.home.filtered;
  const stableAwayPlayerTimeline = stablePlayData.awayPlayerTimeline;
  const stableHomePlayerTimeline = stablePlayData.homePlayerTimeline;
  const stableLastAction = stablePlayData.lastAction;

  const timelineWindow = useMemo(() => {
    const totalSeconds = getGameTotalSeconds(numPeriods);
    if (!activePeriod) {
      return { startSeconds: 0, durationSeconds: totalSeconds };
    }
    return {
      startSeconds: getPeriodStartSeconds(activePeriod),
      durationSeconds: getPeriodDurationSeconds(activePeriod),
    };
  }, [activePeriod, numPeriods]);

  const periodAllActions = useMemo(() => {
    if (!activePeriod) return stableAllActions;
    return stableAllActions.filter((action) => Number(action.period) === activePeriod);
  }, [stableAllActions, activePeriod]);

  const periodScoreTimeline = useMemo(() => {
    if (!activePeriod) return stableScoreTimeline;
    return stableScoreTimeline.filter((action) => Number(action.period) === activePeriod);
  }, [stableScoreTimeline, activePeriod]);

  const periodOddsTimeline = useMemo(() => {
    if (!activePeriod) return stableOddsTimeline;
    return stableOddsTimeline.filter((entry) => Number(entry.period) === activePeriod);
  }, [stableOddsTimeline, activePeriod]);

  const periodAwayPlayers = useMemo(() => {
    if (!activePeriod) return stableAwayPlayers;
    return Object.fromEntries(
      Object.entries(stableAwayPlayers).map(([name, actions]) => [
        name,
        (actions || []).filter((action) => Number(action.period) === activePeriod),
      ]),
    );
  }, [stableAwayPlayers, activePeriod]);

  const periodHomePlayers = useMemo(() => {
    if (!activePeriod) return stableHomePlayers;
    return Object.fromEntries(
      Object.entries(stableHomePlayers).map(([name, actions]) => [
        name,
        (actions || []).filter((action) => Number(action.period) === activePeriod),
      ]),
    );
  }, [stableHomePlayers, activePeriod]);

  const periodAwayPlayerTimeline = useMemo(() => {
    if (!activePeriod) return stableAwayPlayerTimeline;
    return Object.fromEntries(
      Object.entries(stableAwayPlayerTimeline).map(([name, timeline]) => [
        name,
        (timeline || []).filter((entry) => Number(entry.period) === activePeriod),
      ]),
    );
  }, [stableAwayPlayerTimeline, activePeriod]);

  const periodHomePlayerTimeline = useMemo(() => {
    if (!activePeriod) return stableHomePlayerTimeline;
    return Object.fromEntries(
      Object.entries(stableHomePlayerTimeline).map(([name, timeline]) => [
        name,
        (timeline || []).filter((entry) => Number(entry.period) === activePeriod),
      ]),
    );
  }, [stableHomePlayerTimeline, activePeriod]);

  const periodLastAction = useMemo(() => {
    if (!activePeriod) return stableLastAction;
    if (!periodAllActions.length) return null;
    return periodAllActions[periodAllActions.length - 1];
  }, [activePeriod, periodAllActions, stableLastAction]);

  const startScoreDiff = useMemo(() => {
    if (!activePeriod) return 0;
    const startSeconds = getPeriodStartSeconds(activePeriod);
    let diff = 0;
    stableScoreTimeline.forEach((entry) => {
      const elapsed = getSecondsElapsed(entry.period, entry.clock);
      if (elapsed <= startSeconds) {
        diff = Number(entry.away) - Number(entry.home);
      }
    });
    return diff;
  }, [activePeriod, stableScoreTimeline]);

  const startOddsProb = useMemo(() => {
    if (!activePeriod) return null;
    const startSeconds = getPeriodStartSeconds(activePeriod);
    let awayWinProb = null;
    stableOddsTimeline.forEach((entry) => {
      const elapsed = getSecondsElapsed(entry.period, entry.clock);
      if (elapsed <= startSeconds) {
        awayWinProb = Number(entry.awayWinProb);
      }
    });
    return Number.isFinite(awayWinProb) ? awayWinProb : null;
  }, [activePeriod, stableOddsTimeline]);

  const periodData = useMemo(
    () => ({
      timelineWindow,
      allActions: periodAllActions,
      scoreTimeline: periodScoreTimeline,
      oddsTimeline: periodOddsTimeline,
      awayPlayers: periodAwayPlayers,
      homePlayers: periodHomePlayers,
      awayPlayerTimeline: periodAwayPlayerTimeline,
      homePlayerTimeline: periodHomePlayerTimeline,
      lastAction: periodLastAction,
      startScoreDiff,
      startOddsProb,
    }),
    [
      timelineWindow,
      periodAllActions,
      periodScoreTimeline,
      periodOddsTimeline,
      periodAwayPlayers,
      periodHomePlayers,
      periodAwayPlayerTimeline,
      periodHomePlayerTimeline,
      periodLastAction,
      startScoreDiff,
      startOddsProb,
    ],
  );

  return {
    periodData,
  };
}
