import { useMemo } from 'react';
import { useStableWhileLoading } from '../../hooks/ui/useStableWhileLoading';

const EMPTY_PLAY_DATA = Object.freeze({
  awayTeamNames: { name: 'Away Team', abr: '' },
  homeTeamNames: { name: 'Home Team', abr: '' },
  playerActions: {
    away: { filtered: {}, all: {} },
    home: { filtered: {}, all: {} },
  },
  allActions: [],
  scoreTimeline: [],
  awayPlayerTimeline: {},
  homePlayerTimeline: {},
  numQs: 0,
  lastAction: null,
  gameDate: null,
});

const hasPlayData = (data) =>
  Boolean(
    data &&
      ((data.allActions && data.allActions.length) ||
        (data.scoreTimeline && data.scoreTimeline.length) ||
        Object.keys(data.playerActions?.away?.filtered || {}).length ||
        Object.keys(data.playerActions?.home?.filtered || {}).length),
  );

const buildNormalizedPlayData = (playData = EMPTY_PLAY_DATA) => {
  const playerActions = playData.playerActions || EMPTY_PLAY_DATA.playerActions;
  const awayActions = playerActions.away || EMPTY_PLAY_DATA.playerActions.away;
  const homeActions = playerActions.home || EMPTY_PLAY_DATA.playerActions.home;
  const awayFilteredActions = awayActions.filtered || {};
  const homeFilteredActions = homeActions.filtered || {};

  return {
    awayTeamNames: playData.awayTeamNames || EMPTY_PLAY_DATA.awayTeamNames,
    homeTeamNames: playData.homeTeamNames || EMPTY_PLAY_DATA.homeTeamNames,
    playerActions: {
      away: {
        filtered: awayFilteredActions,
        all: awayActions.all || awayFilteredActions,
      },
      home: {
        filtered: homeFilteredActions,
        all: homeActions.all || homeFilteredActions,
      },
    },
    allActions: playData.allActions || EMPTY_PLAY_DATA.allActions,
    scoreTimeline: playData.scoreTimeline || EMPTY_PLAY_DATA.scoreTimeline,
    awayPlayerTimeline: playData.awayPlayerTimeline || EMPTY_PLAY_DATA.awayPlayerTimeline,
    homePlayerTimeline: playData.homePlayerTimeline || EMPTY_PLAY_DATA.homePlayerTimeline,
    numQs: playData.numQs || EMPTY_PLAY_DATA.numQs,
    lastAction: playData.lastAction || EMPTY_PLAY_DATA.lastAction,
    gameDate: playData.gameDate || EMPTY_PLAY_DATA.gameDate,
  };
};

export function useStablePlayData({ isLoading, isBlurred, statusMessage, playData }) {
  const incomingPlayData = useMemo(() => buildNormalizedPlayData(playData), [playData]);

  const { displayData, displayStatusMessage, isShowingStableData } = useStableWhileLoading({
    data: incomingPlayData,
    statusMessage,
    isLoading,
    isBlurred,
  });
  const stablePlayData = displayData;
  const hasStablePlayData = hasPlayData(stablePlayData);
  const hasIncomingPlayData = hasPlayData(incomingPlayData);
  const showStatusMessage = Boolean(displayStatusMessage) && !hasStablePlayData;
  const isDataLoading =
    isBlurred && (hasStablePlayData || hasIncomingPlayData || showStatusMessage);

  return {
    stablePlayData,
    isShowingStableData,
    hasStablePlayData,
    displayStatusMessage,
    showStatusMessage,
    isDataLoading,
  };
}
