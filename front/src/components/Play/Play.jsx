import { useEffect, useRef, useMemo, useState } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme } from '../hooks/useTheme'; // Adjust path
import { getMatchupColors, getSafeBackground } from '../../helpers/teamColors'; // Adjust path
import { useMinimumLoadingState } from '../hooks/useMinimumLoadingState';
import PlayExportControls from './PlayExport/PlayExportControls';
import { useStablePlayData } from './hooks/useStablePlayData';
import { useActivePeriodSelection } from './hooks/useActivePeriodSelection';
import { usePeriodFilteredData } from './hooks/usePeriodFilteredData';
import { usePlayPointerHandlers } from './hooks/usePlayPointerHandlers';

// Sub-components
import Player from './Player/Player';
import ScoreGraph from './ScoreGraph';
import PlayTooltip from './PlayTooltip';
import TimelineGrid from './TimelineGrid'; 

// Custom Hook
import { usePlayInteraction } from './usePlayInteraction';

import './Play.scss';

const LOADING_TEXT_DELAY_MS = 500;
const MIN_BLUR_MS = 300;

export default function Play({ 
  gameId,
  nbaGameId,
  gameStatus,
  gameDate,
  box,
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
  showScoreDiff = true,
  statOn
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

  // --- Layout Constants ---
  const leftMargin = 96;
  const rightMargin = 10;
  // Timeline draw width excludes margins
  const width = Math.max(0, sectionWidth - (leftMargin + rightMargin));

  // Calculate Quarter Width (Dynamic based on Overtime)
  const qWidth = useMemo(() => {
    if (displayNumQs > 4) {
      return width * (12 / (12 * 4 + 5 * (displayNumQs - 4)));
    }
    return width / 4;
  }, [width, displayNumQs]);

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

  // --- Custom Hook for Logic ---
  const {
    descriptionArray,
    mouseLinePos,
    highlightActionIds,
    focusActionMeta,
    infoLocked,
    hasPrevAction,
    hasNextAction,
    navigateAction,
    setInfoLocked,
    mousePosition,
    setMousePosition,
    setMouseLinePos,
    setDescriptionArray,
    setHighlightActionIds,
    updateHoverAt,
    resetInteraction
  } = usePlayInteraction({
    leftMargin,
    timelineWidth: width,
    timelineWindow,
    allActions: filteredAllActions,
    playRef
  });

  useEffect(() => {
    setInfoLocked(false);
    setMouseLinePos(null);
    setDescriptionArray([]);
    setHighlightActionIds([]);
  }, [activePeriod, setInfoLocked, setMouseLinePos, setDescriptionArray, setHighlightActionIds]);

  const {
    isHoveringIcon,
    clearHoverIcon,
    handleMouseMove,
    handleMouseLeave,
    handleClick,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
  } = usePlayPointerHandlers({
    playRef,
    nbaGameId,
    displayAllActions,
    isDataLoading,
    infoLocked,
    descriptionArray,
    setInfoLocked,
    setMousePosition,
    updateHoverAt,
    resetInteraction,
  });

  // --- Visual Data Prep ---
  const teamColors = getMatchupColors(displayAwayTeamNames.abr, displayHomeTeamNames.abr, isDarkMode);
  
  const awayColor = teamColors.away ? getSafeBackground(teamColors.away, isDarkMode) : '';
  const homeColor = teamColors.home ? getSafeBackground(teamColors.home, isDarkMode) : '';

  // Max Score Lead & Y-Axis Scale
  const { maxLead, maxY } = useMemo(() => {
    let max = 0;
    if (displayScoreTimeline) {
      displayScoreTimeline.forEach(t => {
        const scoreDiff = Math.abs(Number(t.away) - Number(t.home));
        if (scoreDiff > max) max = scoreDiff;
      });
    }
    return {
      maxLead: max,
      // Round to nearest 5 and add padding for the chart ceiling
      maxY: Math.floor(max / 5) * 5 + 10
    };
  }, [displayScoreTimeline]);


  const showQuarterSwitcher = isQuarterView && periodOptions.length > 0 && hasDisplayData;
  const quarterSwitcher = showQuarterSwitcher ? (
    <div className="playQuarterSwitcher" style={{ width: sectionWidth }}>
      {periodOptions.map(({ period, label }) => (
        <button
          key={period}
          type="button"
          className={`quarterTab ${period === activePeriod ? 'isActive' : ''}`}
          onClick={() => selectPeriod(period)}
          disabled={isDataLoading || (period !== 0 && period > latestStartedPeriod)}
          aria-pressed={period === activePeriod}
        >
          {label}
        </button>
      ))}
    </div>
  ) : null;

  const showLoadingIndicator = isLoading && !hasDisplayData && !showStatusMessage;

  // --- Render Loading/Error States ---
  if (showLoadingIndicator) {
    return (
      <div className="playWrapper">
        {quarterSwitcher}
        <div className='play'>
          <div className='loadingIndicator'>
            <CircularProgress size={24} thickness={5} />
            <span>Loading play-by-play...</span>
          </div>
        </div>
      </div>
    );
  }

  if (showStatusMessage) {
    return (
      <div className="playWrapper">
        {quarterSwitcher}
        <div className={`play ${isDataLoading ? 'isLoading' : ''}`}>
          <div className='playContent'>
            <div className='statusMessage'>{displayStatusMessage}</div>
          </div>
        </div>
      </div>
    );
  }

  // --- Main Render ---
  return (
    <div className="playWrapper">
      {quarterSwitcher}
      <PlayExportControls
        playRef={playRef}
        gameId={gameId}
        gameStatus={gameStatus}
        gameDate={displayGameDate}
        box={box}
        hasDisplayData={hasDisplayData}
        isDataLoading={isDataLoading}
        isFinal={isFinal}
        numPeriods={numPeriods}
        timelineWindow={timelineWindow}
        leftMargin={leftMargin}
        rightMargin={rightMargin}
        showScoreDiff={showScoreDiff}
        statOn={statOn}
        teamColors={teamColors}
        awayColor={awayColor}
        homeColor={homeColor}
        displayAwayTeamNames={displayAwayTeamNames}
        displayHomeTeamNames={displayHomeTeamNames}
        displayAwayPlayers={displayAwayPlayers}
        displayAwayPlayersAll={displayAwayPlayersAll}
        displayHomePlayers={displayHomePlayers}
        displayHomePlayersAll={displayHomePlayersAll}
        displayAwayPlayerTimeline={displayAwayPlayerTimeline}
        displayHomePlayerTimeline={displayHomePlayerTimeline}
        displayScoreTimeline={displayScoreTimeline}
        displayLastAction={displayLastAction}
        onExportInteractionStart={() => {
          setInfoLocked(false);
          clearHoverIcon();
          resetInteraction(true);
        }}
      />
      <div
        ref={playRef}
        className={`play ${isDataLoading ? 'isLoading' : ''}`}
        style={{ width: sectionWidth }} // Use full section width including margins
        onMouseMove={isDataLoading ? undefined : handleMouseMove}
        onMouseLeave={isDataLoading ? undefined : handleMouseLeave}
        onClick={isDataLoading ? undefined : handleClick}
        // Touch support
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {/* Floating Tooltip */}
        {!isDataLoading && (
          <PlayTooltip 
            descriptionArray={descriptionArray}
            focusActionMeta={focusActionMeta}
            mousePosition={mousePosition}
            infoLocked={infoLocked}
            isHoveringIcon={isHoveringIcon}
            nbaGameId={nbaGameId}
            allActions={filteredAllActions}
            hasPrevAction={hasPrevAction}
            hasNextAction={hasNextAction}
            onNavigate={navigateAction}
            containerRef={playRef}
            awayTeamNames={displayAwayTeamNames}
            homeTeamNames={displayHomeTeamNames}
            teamColors={teamColors}
            leftMargin={leftMargin}
          />
        )}

        {showLoadingOverlay && (
          <div className='loadingOverlay'>
            <CircularProgress size={20} thickness={5} />
            <span>Loading play-by-play...</span>
          </div>
        )}

        <div className='playContent'>
          {/* Main SVG Visualization (Grid + Graph + MouseLine) */}
          <svg height="600" width={sectionWidth} className='line playGrid'>
            <TimelineGrid 
              width={width}
              leftMargin={leftMargin}
              qWidth={qWidth}
              numQs={displayNumQs}
              maxLead={maxLead}
              maxY={maxY}
              showScoreDiff={showScoreDiff}
              awayTeamName={displayAwayTeamNames.name}
              homeTeamName={displayHomeTeamNames.name}
              teamColors={teamColors}
              isQuarterView={isQuarterFocus}
              activePeriodLabel={activePeriodLabel}
            />
            
            <ScoreGraph 
              scoreTimeline={filteredScoreTimeline}
              lastAction={filteredLastAction}
              width={width}
              leftMargin={leftMargin}
              timelineWindow={timelineWindow}
              maxY={maxY}
              showScoreDiff={showScoreDiff}
              awayColor={awayColor}
              homeColor={homeColor}
              startScoreDiff={startScoreDiff}
            />

            {mouseLinePos !== null && (
              <line 
                x1={mouseLinePos} y1={10} 
                x2={mouseLinePos} y2={590} 
                style={{ stroke: 'var(--mouse-line-color)', strokeWidth: 1 }} 
              />
            )}
          </svg>

          {/* Player Rows - Away */}
          <div className="teamName" style={{color: teamColors.away}}>
            {displayAwayTeamNames.name}
          </div>
          <div className='teamSection'>
            {Object.keys(filteredAwayPlayers).map(name => (
              <Player 
                key={name} 
                actions={filteredAwayPlayers[name]} 
                timeline={filteredAwayPlayerTimeline[name]}
                name={name} 
                width={width} 
                rightMargin={rightMargin} 
                heightDivide={Object.keys(filteredAwayPlayers).length}
                highlight={highlightActionIds} 
                leftMargin={leftMargin}
                timelineWindow={timelineWindow}
              />
            ))}
          </div>

          {/* Player Rows - Home */}
          <div className="teamName" style={{color: teamColors.home}}>
            {displayHomeTeamNames.name}
          </div>
          <div className='teamSection'>
            {Object.keys(filteredHomePlayers).map(name => (
              <Player 
                key={name} 
                actions={filteredHomePlayers[name]} 
                timeline={filteredHomePlayerTimeline[name]}
                name={name} 
                width={width} 
                rightMargin={rightMargin} 
                heightDivide={Object.keys(filteredHomePlayers).length}
                highlight={highlightActionIds} 
                leftMargin={leftMargin}
                timelineWindow={timelineWindow}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
