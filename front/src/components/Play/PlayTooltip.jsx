import { useRef, useLayoutEffect, useState } from 'react';
import { getEventType, isFreeThrowAction, LegendShape, renderFreeThrowRing } from '../../helpers/eventStyles.jsx';
import { formatClock, formatPeriod } from '../../helpers/utils';

export default function PlayTooltip({ 
  descriptionArray, 
  mousePosition, 
  infoLocked, 
  containerRef, 
  awayTeamNames, 
  homeTeamNames, 
  teamColors,
  leftMargin 
}) {
  const tooltipRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 300, height: 0 });

  // Measure tooltip height after render to ensure correct positioning
  useLayoutEffect(() => {
    if (tooltipRef.current) {
      setDimensions({
        width: tooltipRef.current.offsetWidth,
        height: tooltipRef.current.offsetHeight
      });
    }
  }, [descriptionArray]);

  if (!descriptionArray || descriptionArray.length === 0) return null;

  // SORTING LOGIC
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
    // Sort by Team first (Away vs Home)
    const teamA = a.teamTricode === awayTeamNames.abr ? 0 : 1;
    const teamB = b.teamTricode === awayTeamNames.abr ? 0 : 1;
    if (teamA !== teamB) return teamA - teamB;
    
    // Then by Event Importance
    return getEventPriority(a.description) - getEventPriority(b.description);
  });

  // POSITIONING LOGIC
  const containerRect = containerRef.current?.getBoundingClientRect();
  const shouldPositionLeft = mousePosition.x > window.innerWidth / 2;
  const shouldPositionBelow = mousePosition.y < window.innerHeight / 2;

  let preferredLeft = shouldPositionLeft ? (mousePosition.x - dimensions.width - 10) : (mousePosition.x + 10);
  let preferredTop = shouldPositionBelow ? (mousePosition.y + 10) : (mousePosition.y - dimensions.height - 10);

  let finalLeft = preferredLeft;
  let finalTop = preferredTop;

  // Clamp to container bounds
  if (containerRect) {
    const hoverPadding = 5;
    const minLeft = containerRect.left + leftMargin - hoverPadding;
    const maxLeft = containerRect.right - dimensions.width; 
    const minTop = containerRect.top;
    const maxTop = containerRect.bottom - dimensions.height;

    finalLeft = Math.max(minLeft, Math.min(preferredLeft, maxLeft));
    finalTop = Math.max(minTop, Math.min(preferredTop, maxTop));
  }

  // Calculate coordinates relative to container (if locked/absolute) or viewport (if fixed)
  const stylePos = infoLocked && containerRect
    ? { 
        position: 'absolute', 
        left: finalLeft - containerRect.left, 
        top: finalTop - containerRect.top 
      }
    : { 
        position: 'fixed', 
        left: finalLeft, 
        top: finalTop 
      };

  const tooltipStyle = {
    ...stylePos,
    zIndex: 1000,
    width: dimensions.width
  };


  // RENDER HELPERS
  const primaryAction = descriptionArray[0];
  
  const HeaderComponent = () => (
    <div className={`time-score-header ${shouldPositionBelow ? 'bottom' : 'top'}`}>
      <span className="time">
        {formatPeriod(primaryAction.period)} {formatClock(primaryAction.clock)}
      </span>
      <span className="score">
        <span className="team-tricode away">{awayTeamNames.abr}</span>
        {primaryAction.scoreAway} - {primaryAction.scoreHome}
        <span className="team-tricode home">{homeTeamNames.abr}</span>
      </span>
    </div>
  );

  const ActionsComponent = () => (
    <div className="actions-container">
      {(() => {
        const freeThrowOneOfOnePattern = /free throw\s+1\s+of\s+1/i;
        const pointActions = sortedActions.filter(action =>
          !isFreeThrowAction(action.description, action.actionType)
          && getEventType(action.description, action.actionType) === 'point'
        );
        const hasPoint = pointActions.length > 0;

        return sortedActions.map((a, index) => {
        const eventType = getEventType(a.description, a.actionType);
        const isFreeThrow = isFreeThrowAction(a.description, a.actionType);
        const is3PT = a.description.includes('3PT');
        const actionTeamColor = a.teamTricode === awayTeamNames.abr ? teamColors.away : teamColors.home;
        const iconSize = 10;
        const iconPadding = 2;
        const iconViewSize = iconSize + iconPadding * 2;
        const iconCenter = iconViewSize / 2;
        
        const isOneOfOne = freeThrowOneOfOnePattern.test(`${a.subType || ''} ${a.description || ''}`);
        const isAnd1 = isOneOfOne && hasPoint;

        return (
          <div key={index} className="action-item">
            <div className="jersey-tab" style={{ backgroundColor: actionTeamColor }} />
            <span className="action-symbol">
              {isFreeThrow ? (
                <svg
                  width={iconViewSize}
                  height={iconViewSize}
                  viewBox={`0 0 ${iconViewSize} ${iconViewSize}`}
                  style={{ display: 'inline-block', verticalAlign: 'middle' }}
                >
                  {renderFreeThrowRing({
                    cx: iconCenter,
                    cy: iconCenter,
                    size: iconSize / 2,
                    key: `ft-ring-${index}`,
                    description: a.description,
                    subType: a.subType,
                    isAnd1
                  })}
                </svg>
              ) : eventType ? (
                <LegendShape eventType={eventType} size={iconSize} is3PT={is3PT} />
              ) : (
                <span style={{ color: 'var(--line-color-light)', fontWeight: 'bold' }}>—</span>
              )}
            </span>
            <div className="action-description">{a.description}</div>
          </div>
        );
        });
      })()}
    </div>
  );

  return (
    <div 
      className="descriptionArea"
      style={tooltipStyle}
      ref={tooltipRef}
    >
      {!shouldPositionBelow ? (
        // Mouse in Bottom Half: Actions on top, Header on bottom
        <>
          <ActionsComponent />
          {primaryAction && <HeaderComponent />}
        </>
      ) : (
        // Mouse in Top Half: Header on top, Actions on bottom
        <>
          {primaryAction && <HeaderComponent />}
          <ActionsComponent />
        </>
      )}

      {infoLocked && (
        <div style={{fontSize: '0.85em', color: 'var(--text-tertiary)', marginTop: 6, lineHeight: 1.4}}>
          <div>Click anywhere to unlock</div>
          <div style={{marginTop: 2}}>← → to navigate events</div>
        </div>
      )}
    </div>
  );
}
