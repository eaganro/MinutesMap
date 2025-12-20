import { useEffect, useRef, useMemo, useState } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme } from '../hooks/useTheme'; // Adjust path
import { getMatchupColors, getSafeBackground } from '../../helpers/teamColors'; // Adjust path

// Sub-components
import Player from './Player/Player';
import ScoreGraph from './ScoreGraph';
import PlayTooltip from './PlayTooltip';
import TimelineGrid from './TimelineGrid'; 

// Custom Hook
import { usePlayInteraction } from './usePlayInteraction';

import './Play.scss';

const LOADING_TEXT_DELAY_MS = 500;

export default function Play({ 
  awayTeamNames, 
  homeTeamNames, 
  awayPlayers, 
  homePlayers, 
  allActions, 
  scoreTimeline, 
  awayPlayerTimeline, 
  homePlayerTimeline, 
  numQs, 
  sectionWidth, 
  lastAction, 
  isLoading, 
  statusMessage, 
  showScoreDiff = true 
}) {
  const playRef = useRef(null);
  const lastStableRef = useRef(null);
  const [showLoadingText, setShowLoadingText] = useState(false);
  const { isDarkMode } = useTheme();

  useEffect(() => {
    if (!isLoading) {
      lastStableRef.current = {
        awayTeamNames,
        homeTeamNames,
        awayPlayers,
        homePlayers,
        allActions,
        scoreTimeline,
        awayPlayerTimeline,
        homePlayerTimeline,
        numQs,
        lastAction,
      };
    }
  }, [
    isLoading,
    awayTeamNames,
    homeTeamNames,
    awayPlayers,
    homePlayers,
    allActions,
    scoreTimeline,
    awayPlayerTimeline,
    homePlayerTimeline,
    numQs,
    lastAction,
  ]);

  const displayData = isLoading && lastStableRef.current
    ? lastStableRef.current
    : {
        awayTeamNames,
        homeTeamNames,
        awayPlayers,
        homePlayers,
        allActions,
        scoreTimeline,
        awayPlayerTimeline,
        homePlayerTimeline,
        numQs,
        lastAction,
      };

  const {
    awayTeamNames: displayAwayTeamNames,
    homeTeamNames: displayHomeTeamNames,
    awayPlayers: displayAwayPlayers,
    homePlayers: displayHomePlayers,
    allActions: displayAllActions,
    scoreTimeline: displayScoreTimeline,
    awayPlayerTimeline: displayAwayPlayerTimeline,
    homePlayerTimeline: displayHomePlayerTimeline,
    numQs: displayNumQs,
    lastAction: displayLastAction,
  } = displayData;

  const hasDisplayData = Boolean(
    (displayAllActions && displayAllActions.length) ||
    (displayScoreTimeline && displayScoreTimeline.length) ||
    Object.keys(displayAwayPlayers || {}).length ||
    Object.keys(displayHomePlayers || {}).length
  );
  const isDataLoading = isLoading && hasDisplayData;

  useEffect(() => {
    if (isLoading && hasDisplayData) {
      const timer = setTimeout(() => setShowLoadingText(true), LOADING_TEXT_DELAY_MS);
      return () => clearTimeout(timer);
    }
    setShowLoadingText(false);
  }, [isLoading, hasDisplayData]);

  const showLoadingOverlay = isDataLoading && showLoadingText;

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

  // --- Custom Hook for Logic ---
  const {
    descriptionArray,
    mouseLinePos,
    highlightActionIds,
    infoLocked,
    setInfoLocked,
    mousePosition,
    setMousePosition,
    updateHoverAt,
    resetInteraction
  } = usePlayInteraction({
    allActions: displayAllActions,
    sectionWidth,
    leftMargin,
    rightMargin,
    qWidth,
    playRef
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


  // --- Event Handlers ---
  const handleMouseMove = (e) => {
    updateHoverAt(e.clientX, e.clientY, e.target);
  };

  const handleClick = (e) => {
    if (!infoLocked) {
      setInfoLocked(true);
      setMousePosition({ x: e.clientX, y: e.clientY });
    } else {
      setInfoLocked(false);
      resetInteraction();
    }
  };

  // --- Render Loading/Error States ---
  if (isLoading && !hasDisplayData) {
    return (
      <div className='play'>
        <div className='loadingIndicator'>
          <CircularProgress size={24} thickness={5} />
          <span>Loading play-by-play...</span>
        </div>
      </div>
    );
  }

  if (statusMessage && !isLoading) {
    return (
      <div className='play'>
        <div className='statusMessage'>{statusMessage}</div>
      </div>
    );
  }

  // --- Main Render ---
  return (
    <div
      ref={playRef}
      className={`play ${isDataLoading ? 'isLoading' : ''}`}
      style={{ width: sectionWidth }} // Use full section width including margins
      onMouseMove={isDataLoading ? undefined : handleMouseMove}
      onMouseLeave={isDataLoading ? undefined : resetInteraction}
      onClick={isDataLoading ? undefined : handleClick}
      // Touch support
      onTouchStart={(e) => !isDataLoading && e.touches[0] && updateHoverAt(e.touches[0].clientX, e.touches[0].clientY, e.target)}
      onTouchMove={(e) => { 
        if(!isDataLoading && e.touches[0]) {
          e.preventDefault(); 
          updateHoverAt(e.touches[0].clientX, e.touches[0].clientY, e.target);
        }
      }}
    >
      {/* Floating Tooltip */}
      {!isDataLoading && (
        <PlayTooltip 
          descriptionArray={descriptionArray}
          mousePosition={mousePosition}
          infoLocked={infoLocked}
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
        <svg height="600" width={sectionWidth} className='line'>
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
          />
          
          <ScoreGraph 
            scoreTimeline={displayScoreTimeline}
            lastAction={displayLastAction}
            width={width}
            leftMargin={leftMargin}
            qWidth={qWidth}
            maxY={maxY}
            showScoreDiff={showScoreDiff}
            awayColor={awayColor}
            homeColor={homeColor}
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
          {Object.keys(displayAwayPlayers).map(name => (
            <Player 
              key={name} 
              actions={displayAwayPlayers[name]} 
              timeline={displayAwayPlayerTimeline[name]}
              name={name} 
              width={width} 
              rightMargin={rightMargin} 
              numQs={displayNumQs} 
              heightDivide={Object.keys(displayAwayPlayers).length}
              highlight={highlightActionIds} 
              leftMargin={leftMargin}
            />
          ))}
        </div>

        {/* Player Rows - Home */}
        <div className="teamName" style={{color: teamColors.home}}>
          {displayHomeTeamNames.name}
        </div>
        <div className='teamSection'>
          {Object.keys(displayHomePlayers).map(name => (
            <Player 
              key={name} 
              actions={displayHomePlayers[name]} 
              timeline={displayHomePlayerTimeline[name]}
              name={name} 
              width={width} 
              rightMargin={rightMargin} 
              numQs={displayNumQs} 
              heightDivide={Object.keys(displayHomePlayers).length}
              highlight={highlightActionIds} 
              leftMargin={leftMargin}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
