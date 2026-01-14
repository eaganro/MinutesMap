import { useRef, useLayoutEffect, useState } from 'react';
import { getEventType, isFreeThrowAction, LegendShape, renderFreeThrowRing } from '../../helpers/eventStyles.jsx';
import { formatClock, formatPeriod } from '../../helpers/utils';

const MOBILE_TOOLTIP_BREAKPOINT = 700;

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

  const isSubstitutionAction = (action) => {
    const type = (action?.actionType || '').toString().toLowerCase();
    if (type === 'substitution') return true;
    const desc = (action?.description || '').toString().toLowerCase();
    return desc.startsWith('sub');
  };

  const parseSubstitutionNames = (description) => {
    const raw = (description || '').toString().trim();
    if (!raw) return null;

    const cleanName = (text) => (text || '')
      .replace(/^[\s,:-]+|[\s,;.-]+$/g, '')
      .trim();

    const inMatch = raw.match(/sub\s*in\s*[:\-–]?\s*(.*)/i);
    const outMatch = raw.match(/sub\s*out\s*[:\-–]?\s*(.*)/i);
    if (inMatch || outMatch) {
      const inPlayer = cleanName(inMatch ? inMatch[1] : '');
      const outPlayer = cleanName(outMatch ? outMatch[1] : '');
      if (!inPlayer && !outPlayer) return null;
      return { inPlayer, outPlayer };
    }

    const fullMatch = raw.match(/sub\s*[:\-–]?\s*(.*?)\s*for\s*(.*)/i);
    if (fullMatch) {
      const inPlayer = cleanName(fullMatch[1]);
      const outPlayer = cleanName(fullMatch[2]);
      if (!inPlayer && !outPlayer) return null;
      return { inPlayer, outPlayer };
    }

    const cleaned = raw.replace(/^sub\s*[:\-–]?\s*/i, '');
    const parts = cleaned.split(/\s+for\s+/i);
    if (parts.length > 1) {
      const inPlayer = cleanName(parts[0]);
      const outPlayer = cleanName(parts.slice(1).join(' for '));
      if (!inPlayer && !outPlayer) return null;
      return { inPlayer, outPlayer };
    }

    const inPlayer = cleanName(cleaned);
    if (!inPlayer) return null;
    return { inPlayer, outPlayer: '' };
  };

  const uniqueList = (items) => {
    const seen = new Set();
    const result = [];
    (items || []).forEach((item) => {
      const text = (item || '').trim();
      if (!text || seen.has(text)) return;
      seen.add(text);
      result.push(text);
    });
    return result;
  };

  const actionsByTeam = { away: [], home: [] };
  const subsByTeam = {
    away: { in: [], out: [], misc: [] },
    home: { in: [], out: [], misc: [] }
  };

  descriptionArray.forEach((action) => {
    const teamKey = action.teamTricode === awayTeamNames.abr ? 'away' : 'home';
    if (isSubstitutionAction(action)) {
      const parsed = parseSubstitutionNames(action.description);
      if (parsed?.inPlayer) subsByTeam[teamKey].in.push(parsed.inPlayer);
      if (parsed?.outPlayer) subsByTeam[teamKey].out.push(parsed.outPlayer);
      if (!parsed) {
        subsByTeam[teamKey].misc.push(action.description);
      }
    } else {
      actionsByTeam[teamKey].push(action);
    }
  });

  // POSITIONING LOGIC
  const containerRect = containerRef.current?.getBoundingClientRect();
  const chartRect = containerRef.current?.querySelector('.playGrid')?.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const isMobileLayout = (containerRect?.width || viewportWidth) <= MOBILE_TOOLTIP_BREAKPOINT;
  const chartTop = chartRect?.top ?? containerRect?.top ?? 0;
  const chartBottom = chartRect?.bottom ?? containerRect?.bottom ?? viewportHeight;
  const chartCenterY = (chartTop + chartBottom) / 2;
  const shouldPositionLeft = !isMobileLayout && mousePosition.x > viewportWidth / 2;
  const shouldPositionBelow = isMobileLayout
    ? mousePosition.y < chartCenterY
    : mousePosition.y < viewportHeight / 2;

  let preferredLeft = shouldPositionLeft
    ? (mousePosition.x - dimensions.width - 10)
    : (mousePosition.x + 10);
  let preferredTop = shouldPositionBelow
    ? (mousePosition.y + 10)
    : (mousePosition.y - dimensions.height - 10);

  if (isMobileLayout) {
    preferredLeft = (viewportWidth - dimensions.width) / 2;
    preferredTop = shouldPositionBelow
      ? (chartBottom - dimensions.height - 10)
      : (chartTop + 10);
  }

  let finalLeft = preferredLeft;
  let finalTop = preferredTop;

  // Clamp to container bounds
  if (containerRect) {
    if (isMobileLayout) {
      const hoverPadding = 8;
      const minLeft = hoverPadding;
      const maxLeft = viewportWidth - dimensions.width - hoverPadding;
      const minTop = chartTop + hoverPadding;
      const maxTop = chartBottom - dimensions.height - hoverPadding;

      finalLeft = Math.max(minLeft, Math.min(preferredLeft, maxLeft));
      finalTop = Math.max(minTop, Math.min(preferredTop, maxTop));
    } else {
      const hoverPadding = 5;
      const minLeft = containerRect.left + leftMargin - hoverPadding;
      const maxLeft = containerRect.right - dimensions.width; 
      const minTop = containerRect.top;
      const maxTop = containerRect.bottom - dimensions.height;

      finalLeft = Math.max(minLeft, Math.min(preferredLeft, maxLeft));
      finalTop = Math.max(minTop, Math.min(preferredTop, maxTop));
    }
  }

  // On mobile, keep the tooltip anchored to the play container so it scrolls away with it.
  const anchorToContainer = containerRect && (infoLocked || isMobileLayout);
  const stylePos = anchorToContainer
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
        const nonSubActions = descriptionArray.filter((action) => !isSubstitutionAction(action));
        const pointActions = nonSubActions.filter(action =>
          !isFreeThrowAction(action.description, action.actionType)
          && getEventType(action.description, action.actionType) === 'point'
        );
        const hasPoint = pointActions.length > 0;

        const buildSubSummary = (subs) => {
          const lines = [];
          const inPlayers = uniqueList(subs.in);
          const outPlayers = uniqueList(subs.out);

          if (inPlayers.length) {
            lines.push(`SUB in: ${inPlayers.join(', ')}`);
          }
          if (outPlayers.length) {
            lines.push(`SUB out: ${outPlayers.join(', ')}`);
          }
          return lines;
        };

        const renderItems = [
          ...(() => {
            const teamActions = [...actionsByTeam.away].sort(
              (a, b) => getEventPriority(a.description) - getEventPriority(b.description)
            );
            const items = teamActions.map((action) => ({
              action,
              teamColor: teamColors.away,
              isSubSummary: false
            }));
            buildSubSummary(subsByTeam.away).forEach((description) => {
              items.push({
                action: { description },
                teamColor: teamColors.away,
                isSubSummary: true
              });
            });
            return items;
          })(),
          ...(() => {
            const teamActions = [...actionsByTeam.home].sort(
              (a, b) => getEventPriority(a.description) - getEventPriority(b.description)
            );
            const items = teamActions.map((action) => ({
              action,
              teamColor: teamColors.home,
              isSubSummary: false
            }));
            buildSubSummary(subsByTeam.home).forEach((description) => {
              items.push({
                action: { description },
                teamColor: teamColors.home,
                isSubSummary: true
              });
            });
            return items;
          })()
        ];

        return renderItems.map((item, index) => {
        const a = item.action;
        const eventType = item.isSubSummary ? null : getEventType(a.description, a.actionType);
        const isFreeThrow = item.isSubSummary ? false : isFreeThrowAction(a.description, a.actionType);
        const is3PT = !item.isSubSummary && a.description.includes('3PT');
        const actionTeamColor = item.teamColor || (a.teamTricode === awayTeamNames.abr ? teamColors.away : teamColors.home);
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
