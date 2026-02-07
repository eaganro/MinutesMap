import { useMemo } from 'react';
import {
  getGameTotalSeconds,
  getPeriodDurationSeconds,
  getPeriodStartSeconds,
  getSecondsElapsed,
} from '../../../helpers/playTimeline';

export function usePeriodFilteredData({
  activePeriod,
  numPeriods,
  displayAllActions,
  displayScoreTimeline,
  displayAwayPlayers,
  displayHomePlayers,
  displayAwayPlayerTimeline,
  displayHomePlayerTimeline,
  displayLastAction,
}) {
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

  const filteredAllActions = useMemo(() => {
    if (!activePeriod) return displayAllActions || [];
    return (displayAllActions || []).filter((action) => Number(action.period) === activePeriod);
  }, [displayAllActions, activePeriod]);

  const filteredScoreTimeline = useMemo(() => {
    if (!activePeriod) return displayScoreTimeline || [];
    return (displayScoreTimeline || []).filter((action) => Number(action.period) === activePeriod);
  }, [displayScoreTimeline, activePeriod]);

  const filteredAwayPlayers = useMemo(() => {
    if (!activePeriod) return displayAwayPlayers || {};
    return Object.fromEntries(
      Object.entries(displayAwayPlayers || {}).map(([name, actions]) => [
        name,
        (actions || []).filter((action) => Number(action.period) === activePeriod),
      ])
    );
  }, [displayAwayPlayers, activePeriod]);

  const filteredHomePlayers = useMemo(() => {
    if (!activePeriod) return displayHomePlayers || {};
    return Object.fromEntries(
      Object.entries(displayHomePlayers || {}).map(([name, actions]) => [
        name,
        (actions || []).filter((action) => Number(action.period) === activePeriod),
      ])
    );
  }, [displayHomePlayers, activePeriod]);

  const filteredAwayPlayerTimeline = useMemo(() => {
    if (!activePeriod) return displayAwayPlayerTimeline || {};
    return Object.fromEntries(
      Object.entries(displayAwayPlayerTimeline || {}).map(([name, timeline]) => [
        name,
        (timeline || []).filter((entry) => Number(entry.period) === activePeriod),
      ])
    );
  }, [displayAwayPlayerTimeline, activePeriod]);

  const filteredHomePlayerTimeline = useMemo(() => {
    if (!activePeriod) return displayHomePlayerTimeline || {};
    return Object.fromEntries(
      Object.entries(displayHomePlayerTimeline || {}).map(([name, timeline]) => [
        name,
        (timeline || []).filter((entry) => Number(entry.period) === activePeriod),
      ])
    );
  }, [displayHomePlayerTimeline, activePeriod]);

  const filteredLastAction = useMemo(() => {
    if (!activePeriod) return displayLastAction;
    if (!filteredAllActions.length) return null;
    return filteredAllActions[filteredAllActions.length - 1];
  }, [activePeriod, filteredAllActions, displayLastAction]);

  const startScoreDiff = useMemo(() => {
    if (!activePeriod) return 0;
    const startSeconds = getPeriodStartSeconds(activePeriod);
    let diff = 0;
    (displayScoreTimeline || []).forEach((entry) => {
      const elapsed = getSecondsElapsed(entry.period, entry.clock);
      if (elapsed <= startSeconds) {
        diff = Number(entry.away) - Number(entry.home);
      }
    });
    return diff;
  }, [activePeriod, displayScoreTimeline]);

  return {
    timelineWindow,
    filteredAllActions,
    filteredScoreTimeline,
    filteredAwayPlayers,
    filteredHomePlayers,
    filteredAwayPlayerTimeline,
    filteredHomePlayerTimeline,
    filteredLastAction,
    startScoreDiff,
  };
}
