import { useRef, useLayoutEffect, useState } from 'react';
import { getEventType, isFreeThrowAction, isThreePointAction, LegendShape, renderFreeThrowRing } from '../../helpers/eventStyles.jsx';
import { formatClock, formatPeriod } from '../../helpers/utils';
import { buildNbaEventUrl, resolveVideoAction } from '../../helpers/nbaEvents';

const MOBILE_TOOLTIP_BREAKPOINT = 700;

const ExternalLinkIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14 3h7v7" />
    <path d="M10 14L21 3" />
    <path d="M21 14v7a2 2 0 0 1-2 2h-7" />
    <path d="M3 10v11a2 2 0 0 0 2 2h11" />
  </svg>
);

export default function PlayTooltip({
  descriptionArray,
  focusActionMeta,
  mousePosition,
  infoLocked,
  isHoveringIcon,
  nbaGameId,
  allActions,
  hasPrevAction,
  hasNextAction,
  onNavigate,
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
  }, [descriptionArray, focusActionMeta, infoLocked]);

  if (!descriptionArray || descriptionArray.length === 0) return null;

  // SORTING LOGIC
  const getEventPriority = (action) => {
    const eventType = getEventType(action?.description, action?.actionType, action?.result);
    if (eventType === 'point') return 0;
    if (eventType === 'assist') return 1;
    if (eventType === 'rebound') return 2;
    return 3;
  };

  const isSubstitutionAction = (action) => {
    const type = (action?.actionType || '').toString().toLowerCase();
    if (type === 'substitution') return true;
    const desc = (action?.description || '').toString().toLowerCase();
    return desc.startsWith('sub');
  };

  const getActionOrderValue = (action) => {
    if (!action) return -Infinity;
    const actionNumber = action.actionNumber;
    if (actionNumber !== undefined && actionNumber !== null) {
      const parsed = parseInt(actionNumber, 10);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return -Infinity;
  };

  const FREE_THROW_ORDER_PATTERN = /\b(?:ft|free throw)\b\s*(\d+)\s*(?:of|\/)\s*(\d+)/i;

  const getFreeThrowOrderValue = (action) => {
    if (!action) return null;
    const text = `${action?.subType || ''} ${action?.description || ''}`;
    const match = text.match(FREE_THROW_ORDER_PATTERN);
    if (!match) return null;
    const attempt = Number(match[1]);
    if (Number.isNaN(attempt)) return null;
    return attempt;
  };

  const compareTeamActions = (a, b) => {
    const aIsFT = isFreeThrowAction(a?.description, a?.actionType);
    const bIsFT = isFreeThrowAction(b?.description, b?.actionType);
    if (aIsFT && bIsFT) {
      const aAttempt = getFreeThrowOrderValue(a);
      const bAttempt = getFreeThrowOrderValue(b);
      if (aAttempt !== null && bAttempt !== null && aAttempt !== bAttempt) {
        return aAttempt - bAttempt;
      }
      const aSeq = getActionOrderValue(a);
      const bSeq = getActionOrderValue(b);
      if (aSeq !== bSeq) return aSeq - bSeq;
    }

    const priorityDiff = getEventPriority(a) - getEventPriority(b);
    if (priorityDiff !== 0) return priorityDiff;

    const aSeq = getActionOrderValue(a);
    const bSeq = getActionOrderValue(b);
    if (aSeq !== bSeq) return aSeq - bSeq;
    return 0;
  };

  const pickLatestAction = (actions) => (
    (actions || []).reduce((best, current) => (
      getActionOrderValue(current) > getActionOrderValue(best) ? current : best
    ), actions[0])
  );

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
    const teamKey = action.side === 'away' || action.side === 'home'
      ? action.side
      : (action.teamTricode === awayTeamNames.abr ? 'away' : 'home');
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
    width: dimensions.width,
    pointerEvents: infoLocked ? 'auto' : 'none'
  };

  const hasPlayableAction = descriptionArray.some((action) => !isSubstitutionAction(action));
  const showVideoHint = !isMobileLayout && Boolean(isHoveringIcon) && hasPlayableAction;
  const videoHintText = 'Click to open video on nba.com';
  const baseVideoAction = descriptionArray.find((action) => !isSubstitutionAction(action)) || null;
  const resolvedVideoAction = resolveVideoAction(baseVideoAction, allActions);
  const videoUrl = buildNbaEventUrl({
    gameId: nbaGameId,
    actionNumber: resolvedVideoAction?.actionNumber ?? baseVideoAction?.actionNumber,
    description: resolvedVideoAction?.description ?? baseVideoAction?.description,
  });
  const showLockedVideoLink = infoLocked && Boolean(videoUrl);
  const lockedVideoLink = showLockedVideoLink ? (
    <div style={{ fontSize: '0.85em', color: 'var(--text-tertiary)', marginTop: 6 }}>
      <a
        href={videoUrl}
        target="_blank"
        rel="noopener"
        onClick={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        style={{
          color: 'var(--score-diff-icon-color, #2563EB)',
          textDecoration: 'underline',
          textUnderlineOffset: 2,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6
        }}
      >
        <span>Open video on nba.com</span>
        <ExternalLinkIcon />
      </a>
    </div>
  ) : null;

  const showNavControls = infoLocked && typeof onNavigate === 'function';
  const mobileNavControls = showNavControls ? (
    <div className="tooltipNav">
      <button
        type="button"
        className="tooltipNavButton"
        onClick={(event) => {
          event.stopPropagation();
          onNavigate(-1);
        }}
        onTouchStart={(event) => event.stopPropagation()}
        disabled={!hasPrevAction}
      >
        ← Prev
      </button>
      <button
        type="button"
        className="tooltipNavButton"
        onClick={(event) => {
          event.stopPropagation();
          onNavigate(1);
        }}
        onTouchStart={(event) => event.stopPropagation()}
        disabled={!hasNextAction}
      >
        Next →
      </button>
    </div>
  ) : null;

  // RENDER HELPERS
  const primaryAction = (() => {
    if (!descriptionArray || descriptionArray.length === 0) return null;
    if (focusActionMeta && focusActionMeta.actionNumber != null) {
      const focusMatch = descriptionArray.find((action) => (
        (focusActionMeta.actionNumber != null && String(action.actionNumber) === String(focusActionMeta.actionNumber))
      ));
      if (focusMatch) return focusMatch;
    }

    const scored = descriptionArray.filter((action) => {
      const away = action?.scoreAway;
      const home = action?.scoreHome;
      return (away !== undefined && away !== null && String(away).trim() !== '') ||
        (home !== undefined && home !== null && String(home).trim() !== '');
    });

    if (scored.length) return pickLatestAction(scored);
    return descriptionArray[0];
  })();
  
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
        const freeThrowOneOfOnePattern = /\b(?:ft|free throw)\b\s*1\s*(?:of|\/)\s*1/i;
        const nonSubActions = descriptionArray.filter((action) => !isSubstitutionAction(action));
        const pointActions = nonSubActions.filter(action =>
          !isFreeThrowAction(action.description, action.actionType)
          && getEventType(action.description, action.actionType, action.result) === 'point'
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
            const teamActions = [...actionsByTeam.away].sort(compareTeamActions);
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
            const teamActions = [...actionsByTeam.home].sort(compareTeamActions);
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
        const eventType = item.isSubSummary ? null : getEventType(a.description, a.actionType, a.result);
        const isFreeThrow = item.isSubSummary ? false : isFreeThrowAction(a.description, a.actionType);
        const is3PT = !item.isSubSummary && isThreePointAction(a.description, a.actionType);
        const actionSide = a.side === 'away' || a.side === 'home'
          ? a.side
          : (a.teamTricode === awayTeamNames.abr ? 'away' : 'home');
        const actionTeamColor = item.teamColor || (actionSide === 'away' ? teamColors.away : teamColors.home);
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
          {mobileNavControls && (
            <div style={{ marginBottom: 6 }}>
              {mobileNavControls}
            </div>
          )}
          <ActionsComponent />
          {lockedVideoLink}
          {primaryAction && <HeaderComponent />}
        </>
      ) : (
        // Mouse in Top Half: Header on top, Actions on bottom
        <>
          {primaryAction && <HeaderComponent />}
          <ActionsComponent />
          {lockedVideoLink}
          {mobileNavControls}
        </>
      )}

      {showVideoHint && (
        <div style={{ fontSize: '0.85em', color: 'var(--text-tertiary)', marginTop: 6 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span>{videoHintText}</span>
            <span style={{ color: 'var(--score-diff-icon-color, #2563EB)' }}>
              <ExternalLinkIcon />
            </span>
          </span>
        </div>
      )}

      {infoLocked ? (
        <div style={{fontSize: '0.85em', color: 'var(--text-tertiary)', marginTop: 6, lineHeight: 1.4}}>
          <div>{isMobileLayout ? 'Tap anywhere to unlock' : 'Click anywhere to unlock'}</div>
          {!isMobileLayout && <div style={{marginTop: 2}}>← → to navigate events</div>}
        </div>
      ) : (
        !isMobileLayout && (
          <div style={{fontSize: '0.85em', color: 'var(--text-tertiary)', marginTop: 6, lineHeight: 1.4}}>
            <div>Click to lock</div>
          </div>
        )
      )}
    </div>
  );
}
