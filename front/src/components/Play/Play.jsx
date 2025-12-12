import { useState, useEffect, useRef } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import { timeToSeconds, formatClock, formatPeriod } from '../../helpers/utils';
import { getEventType, LegendShape } from '../../helpers/eventStyles.jsx';
import { getMatchupColors, getSafeBackground } from '../../helpers/teamColors';
import { useTheme } from '../hooks/useTheme';

import Player from './Player/Player';

import './Play.scss';

export default function Play({ awayTeamNames, homeTeamNames, awayPlayers, homePlayers, allActions, scoreTimeline, awayPlayerTimeline, homePlayerTimeline, numQs, sectionWidth, lastAction, isLoading, statusMessage, showScoreDiff = true }) {

  const [descriptionArray, setDescriptionArray] = useState([]);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [showMouse, setShowMouse] = useState(true);
  const [mouseLinePos, setMouseLinePos] = useState(null);
  const [highlightActionIds, setHighlightActionIds] = useState([]);
  const [infoLocked, setInfoLocked] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const playRef = useRef(null);
  const tooltipRef = useRef(null);
  
  // Subscribe to theme changes to re-render with correct team colors
  const { isDarkMode } = useTheme();

  // Keep only a small gap beyond the player name column (90px)
  const leftMargin = 96; // 90 name + 6px padding
  const rightMargin = 10; // small right-side padding for final actions

  const awayTeamName = awayTeamNames.name;
  const homeTeamName = homeTeamNames.name;

  // Get team colors, with away using secondary if colors clash with home
  // Pass isDarkMode to get the correct color palette
  const teamColors = getMatchupColors(awayTeamNames.abr, homeTeamNames.abr, isDarkMode);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleOutside = (ev) => {
      if (!infoLocked) return;
      const container = playRef.current;
      if (!container) return;
      if (!container.contains(ev.target)) {
        setInfoLocked(false);
        setMouseLinePos(null);
        setDescriptionArray([]);
        setHighlightActionIds([]);
      }
    };
    document.addEventListener('mousedown', handleOutside, { passive: true });
    document.addEventListener('touchstart', handleOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [infoLocked]);

  // Keyboard navigation for locked tooltip
  useEffect(() => {
    if (!infoLocked || !allActions || allActions.length === 0) return;

    const handleKeyDown = (ev) => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      ev.preventDefault();

      // Find current action and its time
      const currentActionId = highlightActionIds[0];
      const currentIndex = allActions.findIndex(a => a.actionNumber === currentActionId);
      if (currentIndex === -1) return;

      const currentAction = allActions[currentIndex];
      const currentClock = currentAction.clock;
      const currentPeriod = currentAction.period;

      // Find next action at a DIFFERENT time (skip all same-time actions)
      let newIndex;
      if (ev.key === 'ArrowLeft') {
        // Search backwards for an action at a different time
        newIndex = currentIndex - 1;
        while (newIndex >= 0 && 
               allActions[newIndex].clock === currentClock && 
               allActions[newIndex].period === currentPeriod) {
          newIndex--;
        }
        if (newIndex < 0) return; // Already at first time group
      } else {
        // Search forwards for an action at a different time
        newIndex = currentIndex + 1;
        while (newIndex < allActions.length && 
               allActions[newIndex].clock === currentClock && 
               allActions[newIndex].period === currentPeriod) {
          newIndex++;
        }
        if (newIndex >= allActions.length) return; // Already at last time group
      }

      const newAction = allActions[newIndex];

      // Collect all actions at this new time (same clock and period)
      const sameTimeActions = allActions.filter(
        a => a.clock === newAction.clock && a.period === newAction.period
      );
      const newActionIds = sameTimeActions.map(a => a.actionNumber);

      // Calculate position for the new action
      const qWidth = (sectionWidth - leftMargin - rightMargin) / 4;
      let actionPos;
      if (newAction.period > 4) {
        actionPos = ((4 * 12 * 60 + 5 * (newAction.period - 4) * 60 - timeToSeconds(newAction.clock)) / (4 * 12 * 60)) * (qWidth * 4);
      } else {
        actionPos = (((newAction.period - 1) * 12 * 60 + 12 * 60 - timeToSeconds(newAction.clock)) / (4 * 12 * 60)) * (qWidth * 4);
      }

      setHighlightActionIds(newActionIds);
      setDescriptionArray(sameTimeActions);
      setMouseLinePos(actionPos + leftMargin);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [infoLocked, highlightActionIds, allActions, sectionWidth, leftMargin]);

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
  const playtimes = {};
  Object.keys(awayPlayers).forEach(player => {
    playtimes[player] = {
      times: [],
      on: false
    };
  });
  Object.keys(awayPlayers).forEach(player => {
    awayPlayers[player].forEach(action => {
      if (action.actionType === 'Substitution') {

      } else {
        if (playtimes[player].on === false) {
          playtimes[player].on = true;
        }
      }
    });
  });
  // Timeline draw width excludes margins
  const width = sectionWidth * 1 - (leftMargin + rightMargin);
  
  let qWidth = width / 4;
  if (numQs > 4) {
    qWidth = width * (12 / (12 * 4 + 5 * (numQs - 4)))
  }

  const awayLength = Object.keys(awayPlayers).length;
  const awayRows = Object.keys(awayPlayers).map(name => {
    return (
      <Player key={name} actions={awayPlayers[name]} timeline={awayPlayerTimeline[name]}
        name={name} width={width} rightMargin={rightMargin} numQs={numQs} heightDivide={awayLength}
        highlight={highlightActionIds} leftMargin={leftMargin}></Player>
    );
  });

  const homeLength = Object.keys(homePlayers).length;
  const homeRows = Object.keys(homePlayers).map(name => {
    return (
      <Player key={name} actions={homePlayers[name]} timeline={homePlayerTimeline[name]}
        name={name} width={width} rightMargin={rightMargin} numQs={numQs} heightDivide={homeLength}
        highlight={highlightActionIds} leftMargin={leftMargin}></Player>
    );
  });

  let maxAwayLead = 0;
  let maxHomeLead = 0;
  scoreTimeline.forEach(t => {
    const scoreDiff = Number(t.away) - Number(t.home);
    maxAwayLead = Math.max(maxAwayLead, scoreDiff);
    maxHomeLead = Math.min(maxHomeLead, scoreDiff);
    t.scoreDiff = scoreDiff;
  });

  let maxLead = Math.max(maxAwayLead, maxHomeLead * -1);

  let maxY = Math.floor(maxLead / 5) * 5 + 10;


  let startx = 0;
  let starty = 0;
  let pospoints = [`${leftMargin},300`];
  let negpoints = [`${leftMargin},300`];

  let pos = true; 
  scoreTimeline.forEach((t, i) => {
      let x1 = startx;
      let x2 = (((t.period - 1) * 12 * 60 + 12 * 60 - timeToSeconds(t.clock)) / (4 * 12 * 60)) * (qWidth * 4);
      if (t.period > 4) {
        x2 = ((4 * 12 * 60 + 5 * (t.period - 4) * 60 - timeToSeconds(t.clock)) / (4 * 12 * 60)) * (qWidth * 4);
      }
      
      let y1 = starty;
      let y2 = t.scoreDiff * -300 / maxY;

      if (y1 <= 0) {
        pos = true;
        pospoints.push(`${leftMargin + x2},${300 + y1}`);
        if (y2 <= 0) {
          pospoints.push(`${leftMargin + x2},${300 + y2}`);
        } else {
          pos = false;
          pospoints.push(`${leftMargin + x2},${300}`);
          negpoints.push(`${leftMargin + x2},${300}`);
          negpoints.push(`${leftMargin + x2},${300 + y2}`);
        }
      } else {
        pos = false;
        negpoints.push(`${leftMargin + x2},${300 + y1}`);
        if (y2 >= 0) {
          negpoints.push(`${leftMargin + x2},${300 + y2}`);
        } else {
          pos = true;
          negpoints.push(`${leftMargin + x2},${300}`);
          pospoints.push(`${leftMargin + x2},${300}`);
          pospoints.push(`${leftMargin + x2},${300 + y2}`);
        }
      }
      
      startx = x2;
      starty = y2;
  });

  if (lastAction) {
    let lastX = (((lastAction.period - 1) * 12 * 60 + 12 * 60 - timeToSeconds(lastAction.clock)) / (4 * 12 * 60)) * (qWidth * 4);
    if (lastAction.period > 4) {
      lastX = ((4 * 12 * 60 + 5 * (lastAction.period - 4) * 60 - timeToSeconds(lastAction.clock)) / (4 * 12 * 60)) * (qWidth * 4);
    }
    if(pos) {
      pospoints.push(`${leftMargin + lastX},${300 + starty}`);
      pospoints.push(`${leftMargin + lastX},300`);
      negpoints.push(`2000,300`);
    } else{
      negpoints.push(`${leftMargin + lastX},${300 + starty}`);
      negpoints.push(`${leftMargin + lastX},300`);
      pospoints.push(`2000,300`);
    }
  }

  const timeline = [];
  // timeline.push(<line key={'secondLast'} x1={leftMargin + startx} y1={300 + starty} x2={leftMargin + width} y2={300 + starty} style={{ stroke: 'rgb(255,0,0)', strokeWidth:2 }} />)
  timeline.unshift(<line key={'Last'} x1={0} y1={300} x2={leftMargin + width} y2={300} style={{ stroke: 'var(--line-color)', strokeWidth:1 }} />)
  timeline.unshift(<line key={'q1'} x1={leftMargin + qWidth} y1={10} x2={leftMargin + qWidth} y2={590} style={{ stroke:'var(--line-color)', strokeWidth:1 }} />)
  timeline.unshift(<line key={'q2'} x1={leftMargin + qWidth * 2} y1={10} x2={leftMargin + qWidth * 2} y2={590} style={{ stroke: 'var(--line-color)', strokeWidth: 1 }} />)
  timeline.unshift(<line key={'q3'} x1={leftMargin + qWidth * 3} y1={10} x2={leftMargin + qWidth * 3} y2={590} style={{ stroke: 'var(--line-color)', strokeWidth: 1 }} />)
  for (let q = 4; q < numQs; q += 1) {
    let x1 = leftMargin + qWidth * 4 + (5/12 * qWidth) * (q - 4);
    let x2 = leftMargin + qWidth * 4 + (5/12 * qWidth) * (q - 4);
    timeline.unshift(<line key={`q${q}`} x1={x1} y1={10} x2={x2} y2={590} style={{ stroke: 'var(--line-color)', strokeWidth: 1 }} />)
  }

  // Quarter labels (Q1, Q2, Q3, Q4, O1, O2, etc.)
  const quarterLabelStyle = { fontSize: '10px', fill: 'var(--quarter-label-color)', fontWeight: 500 };
  const otWidth = (5/12) * qWidth; // overtime period width
  
  // Q1 - Q4 labels centered in each quarter
  timeline.unshift(<text key="label-q1" x={leftMargin + qWidth * 0.5} y={8} textAnchor="middle" style={quarterLabelStyle}>Q1</text>);
  timeline.unshift(<text key="label-q2" x={leftMargin + qWidth * 1.5} y={8} textAnchor="middle" style={quarterLabelStyle}>Q2</text>);
  timeline.unshift(<text key="label-q3" x={leftMargin + qWidth * 2.5} y={8} textAnchor="middle" style={quarterLabelStyle}>Q3</text>);
  timeline.unshift(<text key="label-q4" x={leftMargin + qWidth * 3.5} y={8} textAnchor="middle" style={quarterLabelStyle}>Q4</text>);
  
  // Overtime labels (O1, O2, etc.)
  for (let ot = 1; ot <= numQs - 4; ot += 1) {
    const otCenterX = leftMargin + qWidth * 4 + otWidth * (ot - 0.5);
    timeline.unshift(<text key={`label-o${ot}`} x={otCenterX} y={8} textAnchor="middle" style={quarterLabelStyle}>O{ot}</text>);
  }


  let numLines = 0;
  let lineJump = 0;
  if ((maxLead / 5) < 5) {
    numLines = Math.floor(maxLead / 5)
    lineJump = 5;
  } else if ((maxLead / 10) < 5) {
    numLines = Math.floor(maxLead / 10)
    lineJump = 10;
  } else if ((maxLead / 15) < 5) {
    numLines = Math.floor(maxLead / 15)
    lineJump = 15;
  } else if ((maxLead / 20) < 5) {
    numLines = Math.floor(maxLead / 20)
    lineJump = 20;
  }

  for (let i = 0; i < numLines; i += 1) {
    let posy = 300 + ((i + 1) * lineJump) * - 300 / maxY
    timeline.unshift(<line key={`sp${i}-${awayTeamName}-${homeTeamName}`} x1={leftMargin - 5} y1={posy} x2={leftMargin + width - 5} y2={posy} strokeDasharray={"5,5"} style={{ stroke: teamColors.away, strokeWidth: 0.5 }} />)
    timeline.unshift(<text key={`sp-label-${i}`} x={leftMargin + width + 10} y={posy + 4} textAnchor="end" style={{ ...quarterLabelStyle, fill: teamColors.away }}>{(i + 1) * lineJump}</text>)
    
    let negy = 300 + (-1 * (i + 1) * lineJump) * - 300 / maxY
    timeline.unshift(<line key={`sn${i}-${awayTeamName}-${homeTeamName}`} x1={leftMargin - 5} y1={negy} x2={leftMargin + width - 5} y2={negy} strokeDasharray={"5,5"} style={{ stroke: teamColors.home, strokeWidth: 0.5 }} />)
    timeline.unshift(<text key={`sn-label-${i}`} x={leftMargin + width + 10} y={negy + 4} textAnchor="end" style={{ ...quarterLabelStyle, fill: teamColors.home }}>{(i + 1) * lineJump}</text>)
  }


  const descriptionList = descriptionArray.map((a, index) => (
    <div key={index} className="action-item">
      <div className="action-description">{a.description}</div>
    </div>
  ));
  
  if (descriptionArray[0]) {
    const time = descriptionArray[0].clock;
    const scoreAway = descriptionArray[0].scoreAway;
    const scoreHome = descriptionArray[0].scoreHome;
    descriptionList.unshift(
      <div key="time-score" className="time-score-header">
        <span className="time">{time}</span>
        <span className="score">{scoreAway} - {scoreHome}</span>
      </div>
    );
  }
  let mouseLine = null;
  const updateHoverAt = (clientX, clientY, targetEl) => {
    if (!(showMouse && !infoLocked)) return;
    let el = targetEl;
    while (el && el.className !== 'play') {
      el = el.parentElement;
    }
    if (!el) return;
    const hoverPadding = 5;
    const rawPos = clientX - el.offsetLeft - leftMargin;

    // Update position for tooltip
    setMousePosition({ x: clientX, y: clientY });

    // Allow a small hover tolerance beyond both ends
    if (rawPos < -hoverPadding || rawPos > width + hoverPadding) {
      setMouseLinePos(null);
      setDescriptionArray([]);
      setHighlightActionIds([]);
      return;
    }

    // Clamp within visible timeline for selection/indicator
    let pos = Math.max(0, Math.min(rawPos, width));

    // Check if hovering directly over a specific shape FIRST
    // Look for data-action-number on target or parent (for grouped elements like 3PT)
    let hoveredActionId = null;
    let checkEl = targetEl;
    while (checkEl && hoveredActionId === null) {
      if (checkEl.dataset && checkEl.dataset.actionNumber) {
        hoveredActionId = checkEl.dataset.actionNumber;
      }
      // Stop at SVG boundary
      if (checkEl.tagName === 'svg') break;
      checkEl = checkEl.parentElement;
    }
    
    // If hovering directly over a shape, use that action
    if (hoveredActionId !== null) {
      // Find the action - actionNumber can be a number or string (e.g. "376a" for assists)
      const hoveredAction = allActions.find(action => 
        String(action.actionNumber) === hoveredActionId
      );
      
      if (hoveredAction) {
        const eventType = getEventType(hoveredAction.description);
        const isFreeThrow = hoveredAction.description.includes('Free Throw') || 
                            hoveredAction.description.includes('FT');
        
        let hoverActions;
        let hoverActionIds;
        
        // Points and free throws overlap visually, so show all scoring actions at this time
        if (eventType === 'point' || isFreeThrow) {
          const sameTimeActions = allActions.filter(action => 
            action.clock === hoveredAction.clock && action.period === hoveredAction.period
          );
          // Show all points and free throws at this time
          hoverActions = sameTimeActions.filter(action => {
            const actionIsFT = action.description.includes('Free Throw') || action.description.includes('FT');
            return getEventType(action.description) === 'point' || actionIsFT;
          });
          hoverActionIds = hoverActions.map(action => action.actionNumber);
        } else {
          // Show only the specific hovered action
          hoverActions = [hoveredAction];
          hoverActionIds = [hoveredAction.actionNumber];
        }
        
        // Calculate position based on the hovered action's time
        let actionPos = (((hoveredAction.period - 1) * 12 * 60 + 12 * 60 - timeToSeconds(hoveredAction.clock)) / (4 * 12 * 60)) * (qWidth * 4);
        if (hoveredAction.period > 4) {
          actionPos = ((4 * 12 * 60 + 5 * (hoveredAction.period - 4) * 60 - timeToSeconds(hoveredAction.clock)) / (4 * 12 * 60)) * (qWidth * 4);
        }
        
        setHighlightActionIds(hoverActionIds);
        setDescriptionArray(hoverActions);
        setMouseLinePos(actionPos + leftMargin);
        return;
      }
    }
    
    // Fallback: position-based hover (when not directly over a shape)
    let a = 0;
    let goneOver = false;
    let sameTime = 1;
    for (let i = 1; i < allActions.length && goneOver === false; i += 1) {
      let actionPos = (((allActions[i].period - 1) * 12 * 60 + 12 * 60 - timeToSeconds(allActions[i].clock)) / (4 * 12 * 60)) * (qWidth * 4);
      if (allActions[i].period > 4) {
        actionPos = ((4 * 12 * 60 + 5 * (allActions[i].period - 4) * 60 - timeToSeconds(allActions[i].clock)) / (4 * 12 * 60)) * (qWidth * 4);
      }
      if (actionPos > pos) {
        goneOver = true;
      } else {
        if (allActions[a].clock === allActions[i].clock) {
          sameTime += 1;
        } else {
          sameTime = 1;
        }
        a = i;
      }
    }
    
    // Collect all actions at this time
    const hoverActions = [];
    const hoverActionIds = [];
    for (let i = 0; i < sameTime; i += 1) {
      hoverActions.push(allActions[a - i]);
      hoverActionIds.push(allActions[a - i].actionNumber);
    }
    
    setHighlightActionIds(hoverActionIds);
    setDescriptionArray(hoverActions);
    setMouseLinePos(pos + leftMargin);
  };

  const mouseOver = (e) => {
    updateHoverAt(e.clientX, e.clientY, e.target);
  }

  const mouseOut = (e) => {
    if (!infoLocked) {
      setMouseLinePos(null);
      setDescriptionArray([]);
      setHighlightActionIds([]);
    }
  }

  const handleClick = (e) => {
    if (!infoLocked) {
      // Lock info at current mouse position
      setInfoLocked(true);
      setMousePosition({ x: e.clientX, y: e.clientY });
    } else {
      // Unlock info, resume normal mouseover
      setInfoLocked(false);
      setMouseLinePos(null);
      setDescriptionArray([]);
      setHighlightActionIds([]);
    }
  }

  // Touch support: show tooltip while dragging finger over play area
  const onTouchStart = (e) => {
    if (e.touches && e.touches[0]) {
      updateHoverAt(e.touches[0].clientX, e.touches[0].clientY, e.target);
    }
  };

  const onTouchMove = (e) => {
    if (e.touches && e.touches[0]) {
      // Prevent page from scrolling while scrubbing timeline
      e.preventDefault();
      updateHoverAt(e.touches[0].clientX, e.touches[0].clientY, e.target);
    }
  };

  const onTouchEnd = () => {
    if (!infoLocked) {
      setMouseLinePos(null);
      setDescriptionArray([]);
      setHighlightActionIds([]);
    }
  };

  let awayColor = teamColors.away ? getSafeBackground(teamColors.away, isDarkMode) : '';
  let homeColor = teamColors.home ? getSafeBackground(teamColors.home, isDarkMode) : '';

  // Calculate preferred tooltip placement (left/right, above/below) and clamp within play area
  const tooltipWidth = 300; // matches CSS width
  const tooltipHeight = tooltipRef.current?.offsetHeight || 0;
  const containerRect = playRef.current?.getBoundingClientRect();

  const shouldPositionLeft = mousePosition.x > window.innerWidth / 2;
  const shouldPositionBelow = mousePosition.y < window.innerHeight / 2;

  let preferredLeft = shouldPositionLeft ? (mousePosition.x - tooltipWidth - 10) : (mousePosition.x + 10);
  let preferredTop = shouldPositionBelow ? (mousePosition.y + 10) : (mousePosition.y - tooltipHeight - 10);

  let clampedLeft = preferredLeft;
  let clampedTop = preferredTop;
  if (containerRect) {
    // Allow tooltip to follow a few px into the left margin, and fully within container on the right
    const hoverPadding = 5;
    const minLeft = containerRect.left + leftMargin - hoverPadding;
    const maxLeft = containerRect.right - tooltipWidth; // right margin already provides a few extra px
    const minTop = containerRect.top;
    const maxTop = containerRect.bottom - tooltipHeight;
    clampedLeft = Math.max(minLeft, Math.min(preferredLeft, maxLeft));
    clampedTop = Math.max(minTop, Math.min(preferredTop, maxTop));
  }

  // When locked, position relative to play container so it scrolls with it
  const relativeLeft = containerRect ? clampedLeft - containerRect.left : clampedLeft;
  const relativeTop = containerRect ? clampedTop - containerRect.top : clampedTop;
  const tooltipStyle = infoLocked
    ? { position: 'absolute', left: relativeLeft, top: relativeTop, zIndex: 1000 }
    : { position: 'fixed', left: clampedLeft, top: clampedTop, zIndex: 1000 };

  // Sort actions: away team first, then by event importance (points > assists > rebounds > others)
  const getEventPriority = (description) => {
    const desc = description.toLowerCase();
    // Points (made shots, free throws made)
    if (desc.includes('pts') || (desc.includes('free throw') && !desc.includes('miss'))) return 0;
    // Assists
    if (desc.includes('ast')) return 1;
    // Rebounds
    if (desc.includes('reb')) return 2;
    // Everything else
    return 3;
  };

  const sortedActions = [...descriptionArray].sort((a, b) => {
    // Away team first (0), home team second (1)
    const teamA = a.teamTricode === awayTeamNames.abr ? 0 : 1;
    const teamB = b.teamTricode === awayTeamNames.abr ? 0 : 1;
    if (teamA !== teamB) return teamA - teamB;
    
    // Within same team, sort by event importance
    const priorityA = getEventPriority(a.description);
    const priorityB = getEventPriority(b.description);
    return priorityA - priorityB;
  });

  return (
    <div
      ref={playRef}
      onMouseMove={mouseOver}
      onMouseOut={mouseOut}
      onMouseLeave={mouseOut}
      onClick={handleClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      className='play'
      style={{ width: width + leftMargin + rightMargin }}
    >
      {descriptionArray.length > 0 && (
        <div 
          className="descriptionArea"
          style={tooltipStyle}
          ref={tooltipRef}
        >
          {!shouldPositionBelow ? (
            // When mouse is in bottom half, put actions first, then time/score at bottom
            <>
              <div className="actions-container">
                {sortedActions.map((a, index) => {
                  const eventType = getEventType(a.description);
                  const is3PT = a.description.includes('3PT');
                  const actionTeamColor = a.teamTricode === awayTeamNames.abr 
                    ? teamColors.away 
                    : teamColors.home;
                  return (
                    <div key={index} className="action-item">
                      <div className="jersey-tab" style={{ backgroundColor: actionTeamColor }} />
                      <span className="action-symbol">
                        {eventType ? (
                          <LegendShape eventType={eventType} size={10} is3PT={is3PT} />
                        ) : (
                          <span style={{ color: 'var(--line-color-light)', fontWeight: 'bold' }}>—</span>
                        )}
                      </span>
                      <div className="action-description">{a.description}</div>
                    </div>
                  );
                })}
              </div>
              {descriptionArray[0] && (
                <div className="time-score-header bottom">
                  <span className="time">{formatPeriod(descriptionArray[0].period)} {formatClock(descriptionArray[0].clock)}</span>
                  <span className="score">
                    <span className="team-tricode away">{awayTeamNames.abr}</span>
                    {descriptionArray[0].scoreAway} - {descriptionArray[0].scoreHome}
                    <span className="team-tricode home">{homeTeamNames.abr}</span>
                  </span>
                </div>
              )}
            </>
          ) : (
            // When mouse is in top half, put time/score first, then actions
            <>
              {descriptionArray[0] && (
                <div className="time-score-header top">
                  <span className="time">{formatPeriod(descriptionArray[0].period)} {formatClock(descriptionArray[0].clock)}</span>
                  <span className="score">
                    <span className="team-tricode away">{awayTeamNames.abr}</span>
                    {descriptionArray[0].scoreAway} - {descriptionArray[0].scoreHome}
                    <span className="team-tricode home">{homeTeamNames.abr}</span>
                  </span>
                </div>
              )}
              <div className="actions-container">
                {sortedActions.map((a, index) => {
                  const eventType = getEventType(a.description);
                  const is3PT = a.description.includes('3PT');
                  const actionTeamColor = a.teamTricode === awayTeamNames.abr 
                    ? teamColors.away 
                    : teamColors.home;
                  return (
                    <div key={index} className="action-item">
                      <div className="jersey-tab" style={{ backgroundColor: actionTeamColor }} />
                      <span className="action-symbol">
                        {eventType ? (
                          <LegendShape eventType={eventType} size={10} is3PT={is3PT} />
                        ) : (
                          <span style={{ color: 'var(--line-color-light)', fontWeight: 'bold' }}>—</span>
                        )}
                      </span>
                      <div className="action-description">{a.description}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {infoLocked && (
            <div style={{fontSize: '0.85em', color: 'var(--text-tertiary)', marginTop: 6, lineHeight: 1.4}}>
              <div>Click anywhere to unlock</div>
              <div style={{marginTop: 2}}>← → to navigate events</div>
            </div>
          )}
        </div>
      )}
      <svg height="600" width={width + leftMargin + rightMargin} className='line'>
        {timeline}
        {showScoreDiff && <polyline points={pospoints.join(' ')} style={{"fill": awayColor}}/>}
        {showScoreDiff && <polyline points={negpoints.join(' ')} style={{"fill": homeColor}}/>}
      </svg>
      <svg height="600" width={width + leftMargin + rightMargin} className='line'>
        {mouseLinePos !== null ? 
          <line x1={mouseLinePos} y1={10} x2={mouseLinePos} y2={590} style={{ stroke: 'var(--mouse-line-color)', strokeWidth: 1 }} />
          : ''}
      </svg>
      <div className="teamName" style={{color: teamColors.away}}>{awayTeamName}</div>
      <div className='teamSection'>
        {awayRows}
      </div>
      <div className="teamName" style={{color: teamColors.home}}>{homeTeamName}</div>
      <div className='teamSection'>
        {homeRows}
      </div>
    </div>
  );
}

