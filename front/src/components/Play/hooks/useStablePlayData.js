import { useEffect, useMemo, useRef } from 'react';

const hasPlayData = (data) => Boolean(
  data &&
  (
    (data.allActions && data.allActions.length) ||
    (data.scoreTimeline && data.scoreTimeline.length) ||
    Object.keys(data.awayPlayers || {}).length ||
    Object.keys(data.homePlayers || {}).length
  )
);

const buildDisplayData = ({
  awayTeamNames,
  homeTeamNames,
  awayPlayers,
  awayPlayersAll,
  homePlayers,
  homePlayersAll,
  allActions,
  scoreTimeline,
  awayPlayerTimeline,
  homePlayerTimeline,
  numQs,
  lastAction,
  gameDate,
}) => ({
  awayTeamNames,
  homeTeamNames,
  awayPlayers,
  awayPlayersAll: awayPlayersAll || awayPlayers,
  homePlayers,
  homePlayersAll: homePlayersAll || homePlayers,
  allActions,
  scoreTimeline,
  awayPlayerTimeline,
  homePlayerTimeline,
  numQs,
  lastAction,
  gameDate,
});

export function useStablePlayData({
  isLoading,
  isBlurred,
  statusMessage,
  awayTeamNames,
  homeTeamNames,
  awayPlayers,
  awayPlayersAll,
  homePlayers,
  homePlayersAll,
  allActions,
  scoreTimeline,
  awayPlayerTimeline,
  homePlayerTimeline,
  numQs,
  lastAction,
  gameDate,
}) {
  const incomingData = useMemo(() => buildDisplayData({
    awayTeamNames,
    homeTeamNames,
    awayPlayers,
    awayPlayersAll,
    homePlayers,
    homePlayersAll,
    allActions,
    scoreTimeline,
    awayPlayerTimeline,
    homePlayerTimeline,
    numQs,
    lastAction,
    gameDate,
  }), [
    awayTeamNames,
    homeTeamNames,
    awayPlayers,
    awayPlayersAll,
    homePlayers,
    homePlayersAll,
    allActions,
    scoreTimeline,
    awayPlayerTimeline,
    homePlayerTimeline,
    numQs,
    lastAction,
    gameDate,
  ]);

  const lastStableRef = useRef({
    awayTeamNames,
    homeTeamNames,
    awayPlayers,
    awayPlayersAll,
    homePlayers,
    homePlayersAll,
    allActions,
    scoreTimeline,
    awayPlayerTimeline,
    homePlayerTimeline,
    numQs,
    lastAction,
    gameDate,
  });
  const lastStatusMessageRef = useRef(statusMessage);

  useEffect(() => {
    if (isLoading || isBlurred) {
      return;
    }
    lastStableRef.current = incomingData;
  }, [isLoading, isBlurred, incomingData]);

  useEffect(() => {
    if (isLoading || isBlurred) {
      return;
    }
    lastStatusMessageRef.current = statusMessage;
  }, [statusMessage, isLoading, isBlurred]);

  const showStableData = (isLoading || isBlurred) && lastStableRef.current;
  const displayData = showStableData ? lastStableRef.current : incomingData;

  const isShowingStableData = Boolean(showStableData);
  const hasDisplayData = hasPlayData(displayData);
  const hasIncomingData = hasPlayData({
    allActions,
    scoreTimeline,
    awayPlayers,
    homePlayers,
  });

  const displayStatusMessage = (isLoading || isBlurred)
    ? lastStatusMessageRef.current
    : statusMessage;
  const showStatusMessage = Boolean(displayStatusMessage) && !hasDisplayData;
  const isDataLoading = isBlurred && (hasDisplayData || hasIncomingData || showStatusMessage);

  return {
    displayData,
    isShowingStableData,
    hasDisplayData,
    displayStatusMessage,
    showStatusMessage,
    isDataLoading,
  };
}
