import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../../hooks/ui/useTheme';
import { getMatchupColors, getSafeBackground } from '../../../helpers/teamColors';
import { useMinimumLoadingState } from '../../hooks/ui/useMinimumLoadingState';
import { LOADING_TEXT_DELAY_MS, MIN_BLUR_MS } from '../../constants/loadingUiTimings';
import { useStablePlayData } from './useStablePlayData';
import { useActivePeriodSelection } from './useActivePeriodSelection';
import { usePeriodFilteredData } from './usePeriodFilteredData';
import {
  PLAY_COMPACT_RIGHT_MARGIN,
  PLAY_LEFT_MARGIN,
  PLAY_RIGHT_MARGIN,
  PLAY_SHORT_NAMES_LEFT_MARGIN,
  getMarkerScale,
  getScoreScale,
  getTimelineWidth,
  hasShortNamesAt,
  isCompactPlayWidth,
} from '../model/layoutModel';

export function usePlayViewModel({
  gameId,
  gameStatus,
  playData,
  sectionWidth,
  isLoading,
  statusMessage,
}) {
  const playRef = useRef(null);
  const [showLoadingText, setShowLoadingText] = useState(false);
  const { isDarkMode } = useTheme();
  const isBlurred = useMinimumLoadingState(isLoading, MIN_BLUR_MS, { skipFirstLoad: true });

  const {
    stablePlayData,
    isShowingStableData,
    hasStablePlayData,
    displayStatusMessage,
    showStatusMessage,
    isDataLoading,
  } = useStablePlayData({
    isLoading,
    isBlurred,
    statusMessage,
    playData,
  });

  const displayAwayTeamNames = stablePlayData.awayTeamNames;
  const displayHomeTeamNames = stablePlayData.homeTeamNames;
  const displayAwayPlayers = stablePlayData.playerActions.away.filtered;
  const displayAwayPlayersAll = stablePlayData.playerActions.away.all;
  const displayHomePlayers = stablePlayData.playerActions.home.filtered;
  const displayHomePlayersAll = stablePlayData.playerActions.home.all;
  const displayScoreTimeline = stablePlayData.scoreTimeline;
  const displayAwayPlayerTimeline = stablePlayData.awayPlayerTimeline;
  const displayHomePlayerTimeline = stablePlayData.homePlayerTimeline;
  const displayNumQs = stablePlayData.numQs;
  const displayLastAction = stablePlayData.lastAction;
  const displayGameDate = stablePlayData.gameDate;
  const hasDisplayData = hasStablePlayData;

  useEffect(() => {
    if (isLoading && hasDisplayData) {
      const timer = setTimeout(() => setShowLoadingText(true), LOADING_TEXT_DELAY_MS);
      return () => clearTimeout(timer);
    }
    setShowLoadingText(false);
  }, [isLoading, hasDisplayData]);

  const showLoadingOverlay = isLoading && hasDisplayData && showLoadingText;

  const hasShortNames = hasShortNamesAt(sectionWidth);
  const leftMargin = hasShortNames ? PLAY_SHORT_NAMES_LEFT_MARGIN : PLAY_LEFT_MARGIN;
  const rightMargin = isCompactPlayWidth(sectionWidth)
    ? PLAY_COMPACT_RIGHT_MARGIN
    : PLAY_RIGHT_MARGIN;
  const width = getTimelineWidth(sectionWidth, leftMargin, rightMargin);

  const numPeriods = Number(displayNumQs) || 0;
  const {
    isQuarterView,
    periodOptions,
    isFinal,
    activePeriod,
    isQuarterFocus,
    activePeriodLabel,
    latestStartedPeriod,
    selectPeriod,
  } = useActivePeriodSelection({
    gameId,
    gameStatus,
    displayLastAction,
    numPeriods,
    sectionWidth,
    isShowingStableData,
  });

  const { periodData } = usePeriodFilteredData({
    activePeriod,
    numPeriods,
    stablePlayData,
    // Phones only: a live game's Game view and current quarter end where play is.
    clipToPlayed: isQuarterView && !isFinal,
  });
  const timelineWindow = periodData.timelineWindow;
  const markerScale = getMarkerScale(width, timelineWindow.durationSeconds);
  const filteredAllActions = periodData.allActions;
  const filteredScoreTimeline = periodData.scoreTimeline;
  const filteredOddsTimeline = periodData.oddsTimeline;
  const filteredAwayPlayers = periodData.awayPlayers;
  const filteredHomePlayers = periodData.homePlayers;
  const filteredAwayPlayerTimeline = periodData.awayPlayerTimeline;
  const filteredHomePlayerTimeline = periodData.homePlayerTimeline;
  const filteredLastAction = periodData.lastAction;
  const startScoreDiff = periodData.startScoreDiff;
  const startOddsProb = periodData.startOddsProb;

  const teamColors = getMatchupColors(
    displayAwayTeamNames.abr,
    displayHomeTeamNames.abr,
    isDarkMode,
  );
  const awayColor = teamColors.away ? getSafeBackground(teamColors.away, isDarkMode) : '';
  const homeColor = teamColors.home ? getSafeBackground(teamColors.home, isDarkMode) : '';

  const { maxLead, maxY } = useMemo(
    () => getScoreScale(displayScoreTimeline),
    [displayScoreTimeline],
  );

  const showQuarterSwitcher = isQuarterView && periodOptions.length > 0 && hasDisplayData;
  const showLoadingIndicator = isLoading && !hasDisplayData && !showStatusMessage;

  return {
    stablePlayData,
    periodData,
    playRef,
    hasShortNames,
    markerScale,
    leftMargin,
    rightMargin,
    width,
    numPeriods,
    isFinal,
    activePeriod,
    isQuarterFocus,
    activePeriodLabel,
    latestStartedPeriod,
    selectPeriod,
    showQuarterSwitcher,
    periodOptions,
    showLoadingIndicator,
    showLoadingOverlay,
    displayStatusMessage,
    showStatusMessage,
    isDataLoading,
    hasDisplayData,
    displayAwayTeamNames,
    displayHomeTeamNames,
    displayAwayPlayers,
    displayAwayPlayersAll,
    displayHomePlayers,
    displayHomePlayersAll,
    displayScoreTimeline,
    displayAwayPlayerTimeline,
    displayHomePlayerTimeline,
    displayNumQs,
    displayLastAction,
    displayGameDate,
    filteredAllActions,
    filteredScoreTimeline,
    filteredOddsTimeline,
    filteredAwayPlayers,
    filteredHomePlayers,
    filteredAwayPlayerTimeline,
    filteredHomePlayerTimeline,
    filteredLastAction,
    timelineWindow,
    startScoreDiff,
    startOddsProb,
    teamColors,
    awayColor,
    homeColor,
    maxLead,
    maxY,
  };
}
