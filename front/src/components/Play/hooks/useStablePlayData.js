import { useMemo } from 'react';
import { useStableWhileLoading } from '../../hooks/ui/useStableWhileLoading';

const hasPlayData = (data) =>
  Boolean(
    data &&
      ((data.allActions && data.allActions.length) ||
        (data.scoreTimeline && data.scoreTimeline.length) ||
        Object.keys(data.awayPlayers || {}).length ||
        Object.keys(data.homePlayers || {}).length),
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
  const incomingData = useMemo(
    () =>
      buildDisplayData({
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
      }),
    [
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
    ],
  );
  const { displayData, displayStatusMessage, isShowingStableData } = useStableWhileLoading({
    data: incomingData,
    statusMessage,
    isLoading,
    isBlurred,
  });
  const hasDisplayData = hasPlayData(displayData);
  const hasIncomingData = hasPlayData(incomingData);
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
