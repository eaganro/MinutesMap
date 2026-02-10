import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { getMatchupColors, getSafeBackground } from '../../../helpers/teamColors';
import { useMinimumLoadingState } from '../../hooks/useMinimumLoadingState';
import { LOADING_TEXT_DELAY_MS, MIN_BLUR_MS } from '../../hooks/loadingUiTimings';
import { useStablePlayData } from './useStablePlayData';
import { useActivePeriodSelection } from './useActivePeriodSelection';
import { usePeriodFilteredData } from './usePeriodFilteredData';
import {
  PLAY_LEFT_MARGIN,
  PLAY_RIGHT_MARGIN,
  getQuarterWidth,
  getScoreScale,
  getTimelineWidth,
} from '../model/layoutModel';

export function usePlayViewModel({
  gameId,
  gameStatus,
  gameDate,
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
  sectionWidth,
  lastAction,
  isLoading,
  statusMessage,
}) {
  const playRef = useRef(null);
  const [showLoadingText, setShowLoadingText] = useState(false);
  const { isDarkMode } = useTheme();
  const isBlurred = useMinimumLoadingState(isLoading, MIN_BLUR_MS);

  const {
    displayData,
    isShowingStableData,
    hasDisplayData,
    displayStatusMessage,
    showStatusMessage,
    isDataLoading,
  } = useStablePlayData({
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
  });

  const {
    awayTeamNames: displayAwayTeamNames,
    homeTeamNames: displayHomeTeamNames,
    awayPlayers: displayAwayPlayers,
    awayPlayersAll: displayAwayPlayersAll,
    homePlayers: displayHomePlayers,
    homePlayersAll: displayHomePlayersAll,
    allActions: displayAllActions,
    scoreTimeline: displayScoreTimeline,
    awayPlayerTimeline: displayAwayPlayerTimeline,
    homePlayerTimeline: displayHomePlayerTimeline,
    numQs: displayNumQs,
    lastAction: displayLastAction,
    gameDate: displayGameDate,
  } = displayData;

  useEffect(() => {
    if (isLoading && hasDisplayData) {
      const timer = setTimeout(() => setShowLoadingText(true), LOADING_TEXT_DELAY_MS);
      return () => clearTimeout(timer);
    }
    setShowLoadingText(false);
  }, [isLoading, hasDisplayData]);

  const showLoadingOverlay = isLoading && hasDisplayData && showLoadingText;

  const leftMargin = PLAY_LEFT_MARGIN;
  const rightMargin = PLAY_RIGHT_MARGIN;
  const width = getTimelineWidth(sectionWidth, leftMargin, rightMargin);

  const qWidth = useMemo(() => getQuarterWidth(width, displayNumQs), [width, displayNumQs]);

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

  const {
    timelineWindow,
    filteredAllActions,
    filteredScoreTimeline,
    filteredAwayPlayers,
    filteredHomePlayers,
    filteredAwayPlayerTimeline,
    filteredHomePlayerTimeline,
    filteredLastAction,
    startScoreDiff,
  } = usePeriodFilteredData({
    activePeriod,
    numPeriods,
    displayAllActions,
    displayScoreTimeline,
    displayAwayPlayers,
    displayHomePlayers,
    displayAwayPlayerTimeline,
    displayHomePlayerTimeline,
    displayLastAction,
  });

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
    playRef,
    leftMargin,
    rightMargin,
    width,
    qWidth,
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
    filteredAwayPlayers,
    filteredHomePlayers,
    filteredAwayPlayerTimeline,
    filteredHomePlayerTimeline,
    filteredLastAction,
    timelineWindow,
    startScoreDiff,
    teamColors,
    awayColor,
    homeColor,
    maxLead,
    maxY,
  };
}
