import { useRef, useMemo } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme } from '../hooks/useTheme'; // Adjust path
import { getMatchupColors, getSafeBackground } from '../../helpers/teamColors'; // Adjust path

// Sub-components
import Player from './Player/Player';
import ScoreGraph from './ScoreGraph';
import PlayTooltip from './PlayTooltip';
import TimelineGrid from './TimelineGrid'; 

// Custom Hook
import { usePlayInteraction } from '../hooks/usePlayInteraction';

import './Play.scss';

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
  const { isDarkMode } = useTheme();

  // --- Layout Constants ---
  const leftMargin = 96;
  const rightMargin = 10;
  // Timeline draw width excludes margins
  const width = Math.max(0, sectionWidth - (leftMargin + rightMargin));

  // Calculate Quarter Width (Dynamic based on Overtime)
  const qWidth = useMemo(() => {
    if (numQs > 4) {
      return width * (12 / (12 * 4 + 5 * (numQs - 4)));
    }
    return width / 4;
  }, [width, numQs]);

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
    allActions,
    sectionWidth,
    leftMargin,
    rightMargin,
    qWidth,
    playRef
  });

  // --- Visual Data Prep ---
  const teamColors = getMatchupColors(awayTeamNames.abr, homeTeamNames.abr, isDarkMode);
  
  const awayColor = teamColors.away ? getSafeBackground(teamColors.away, isDarkMode) : '';
  const homeColor = teamColors.home ? getSafeBackground(teamColors.home, isDarkMode) : '';

  // Max Score Lead & Y-Axis Scale
  const { maxLead, maxY } = useMemo(() => {
    let max = 0;
    if (scoreTimeline) {
      scoreTimeline.forEach(t => {
        const scoreDiff = Math.abs(Number(t.away) - Number(t.home));
        if (scoreDiff > max) max = scoreDiff;
      });
    }
    return {
      maxLead: max,
      // Round to nearest 5 and add padding for the chart ceiling
      maxY: Math.floor(max / 5) * 5 + 10
    };
  }, [scoreTimeline]);


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
  if (isLoading) {
    return (
      <div className='play'>
        <div className='loadingIndicator'>
          <CircularProgress size={24} thickness={5} />
          <span>Loading play-by-play...</span>
        </div>
      </div>
    );
  }

  if (statusMessage) {
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
      className='play'
      style={{ width: sectionWidth }} // Use full section width including margins
      onMouseMove={handleMouseMove}
      onMouseLeave={resetInteraction}
      onClick={handleClick}
      // Touch support
      onTouchStart={(e) => e.touches[0] && updateHoverAt(e.touches[0].clientX, e.touches[0].clientY, e.target)}
      onTouchMove={(e) => { 
        if(e.touches[0]) {
          e.preventDefault(); 
          updateHoverAt(e.touches[0].clientX, e.touches[0].clientY, e.target);
        }
      }}
    >
      {/* Floating Tooltip */}
      <PlayTooltip 
        descriptionArray={descriptionArray}
        mousePosition={mousePosition}
        infoLocked={infoLocked}
        containerRef={playRef}
        awayTeamNames={awayTeamNames}
        homeTeamNames={homeTeamNames}
        teamColors={teamColors}
        leftMargin={leftMargin}
      />

      {/* Main SVG Visualization (Grid + Graph + MouseLine) */}
      <svg height="600" width={sectionWidth} className='line'>
        <TimelineGrid 
          width={width}
          leftMargin={leftMargin}
          qWidth={qWidth}
          numQs={numQs}
          maxLead={maxLead}
          maxY={maxY}
          showScoreDiff={showScoreDiff}
          awayTeamName={awayTeamNames.name}
          homeTeamName={homeTeamNames.name}
          teamColors={teamColors}
        />
        
        <ScoreGraph 
          scoreTimeline={scoreTimeline}
          lastAction={lastAction}
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
        {awayTeamNames.name}
      </div>
      <div className='teamSection'>
        {Object.keys(awayPlayers).map(name => (
          <Player 
            key={name} 
            actions={awayPlayers[name]} 
            timeline={awayPlayerTimeline[name]}
            name={name} 
            width={width} 
            rightMargin={rightMargin} 
            numQs={numQs} 
            heightDivide={Object.keys(awayPlayers).length}
            highlight={highlightActionIds} 
            leftMargin={leftMargin}
          />
        ))}
      </div>

      {/* Player Rows - Home */}
      <div className="teamName" style={{color: teamColors.home}}>
        {homeTeamNames.name}
      </div>
      <div className='teamSection'>
        {Object.keys(homePlayers).map(name => (
          <Player 
            key={name} 
            actions={homePlayers[name]} 
            timeline={homePlayerTimeline[name]}
            name={name} 
            width={width} 
            rightMargin={rightMargin} 
            numQs={numQs} 
            heightDivide={Object.keys(homePlayers).length}
            highlight={highlightActionIds} 
            leftMargin={leftMargin}
          />
        ))}
      </div>
    </div>
  );
}