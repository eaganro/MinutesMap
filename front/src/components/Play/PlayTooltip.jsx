import { useMemo, useRef, useLayoutEffect, useState } from 'react';
import {
  getEventType,
  isFreeThrowAction,
  isThreePointAction,
} from '../../domain/events/classification';
import { clampWinProbability, formatWinProbabilityPercent } from '../../helpers/odds';
import { LegendShape, renderFreeThrowRing } from '../../ui/eventShapes.jsx';
import { formatClock, formatPeriod } from '../../helpers/utils';
import { buildNbaEventUrl, resolveVideoAction } from '../../helpers/nbaEvents';
import { buildTooltipStyle, computeTooltipLayout } from './model/layoutModel';
import {
  buildTooltipRenderItems,
  groupTooltipItemsByTeam,
  isSubstitutionAction,
  pickPrimaryTooltipAction,
} from './model/tooltipModel';

const FREE_THROW_ONE_OF_ONE_PATTERN = /\b(?:ft|free throw)\b\s*1\s*(?:of|\/)\s*1/i;

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
  leftMargin,
}) {
  const tooltipRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 300, height: 0 });

  useLayoutEffect(() => {
    if (tooltipRef.current) {
      setDimensions({
        width: tooltipRef.current.offsetWidth,
        height: tooltipRef.current.offsetHeight,
      });
    }
  }, [descriptionArray, focusActionMeta, infoLocked]);

  const safeDescriptionArray = descriptionArray || [];
  const hasDescriptions = safeDescriptionArray.length > 0;

  const { actionsByTeam, subsByTeam } = useMemo(
    () =>
      groupTooltipItemsByTeam({
        descriptionArray: safeDescriptionArray,
        awayTeamAbr: awayTeamNames.abr,
      }),
    [safeDescriptionArray, awayTeamNames.abr],
  );

  const renderItems = useMemo(
    () =>
      buildTooltipRenderItems({
        actionsByTeam,
        subsByTeam,
        teamColors,
      }),
    [actionsByTeam, subsByTeam, teamColors],
  );

  const primaryAction = useMemo(
    () => pickPrimaryTooltipAction(safeDescriptionArray, focusActionMeta),
    [safeDescriptionArray, focusActionMeta],
  );

  const containerRect = containerRef.current?.getBoundingClientRect();
  const chartRect = containerRef.current?.querySelector('.playGrid')?.getBoundingClientRect();
  const layout = computeTooltipLayout({
    mousePosition,
    dimensions,
    containerRect,
    chartRect,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    leftMargin,
    infoLocked,
  });

  const tooltipStyle = buildTooltipStyle({
    containerRect,
    anchorToContainer: layout.anchorToContainer,
    finalLeft: layout.finalLeft,
    finalTop: layout.finalTop,
    width: dimensions.width,
    infoLocked,
  });

  const hasPlayableAction = safeDescriptionArray.some((action) => !isSubstitutionAction(action));
  const showVideoHint = !layout.isMobileLayout && Boolean(isHoveringIcon) && hasPlayableAction;
  const baseVideoAction =
    safeDescriptionArray.find((action) => !isSubstitutionAction(action)) || null;
  const resolvedVideoAction = resolveVideoAction(baseVideoAction, allActions);
  const videoUrl = buildNbaEventUrl({
    gameId: nbaGameId,
    actionNumber: resolvedVideoAction?.actionNumber ?? baseVideoAction?.actionNumber,
    description: resolvedVideoAction?.description ?? baseVideoAction?.description,
  });

  const showLockedVideoLink = infoLocked && Boolean(videoUrl);
  const showNavControls = infoLocked && typeof onNavigate === 'function';

  if (!hasDescriptions) return null;

  return (
    <div className="descriptionArea" style={tooltipStyle} ref={tooltipRef}>
      {!layout.shouldPositionBelow ? (
        <>
          {showNavControls && (
            <div className="tooltipNav" style={{ marginBottom: 6 }}>
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
          )}
          <TooltipActions
            descriptionArray={safeDescriptionArray}
            awayTeamNames={awayTeamNames}
            teamColors={teamColors}
            renderItems={renderItems}
          />
          {showLockedVideoLink && <LockedVideoLink videoUrl={videoUrl} />}
          {primaryAction && (
            <TooltipHeader
              primaryAction={primaryAction}
              awayTeamNames={awayTeamNames}
              homeTeamNames={homeTeamNames}
              awayWinProb={focusActionMeta?.awayWinProb}
              shouldPositionBelow={layout.shouldPositionBelow}
            />
          )}
        </>
      ) : (
        <>
          {primaryAction && (
            <TooltipHeader
              primaryAction={primaryAction}
              awayTeamNames={awayTeamNames}
              homeTeamNames={homeTeamNames}
              awayWinProb={focusActionMeta?.awayWinProb}
              shouldPositionBelow={layout.shouldPositionBelow}
            />
          )}
          <TooltipActions
            descriptionArray={safeDescriptionArray}
            awayTeamNames={awayTeamNames}
            teamColors={teamColors}
            renderItems={renderItems}
          />
          {showLockedVideoLink && <LockedVideoLink videoUrl={videoUrl} />}
          {showNavControls && (
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
          )}
        </>
      )}

      {showVideoHint && (
        <div style={{ fontSize: '0.85em', color: 'var(--text-tertiary)', marginTop: 6 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span>Click to open video on nba.com</span>
            <span style={{ color: 'var(--score-diff-icon-color, #2563EB)' }}>
              <ExternalLinkIcon />
            </span>
          </span>
        </div>
      )}

      {infoLocked ? (
        <div
          style={{
            fontSize: '0.85em',
            color: 'var(--text-tertiary)',
            marginTop: 6,
            lineHeight: 1.4,
          }}
        >
          <div>{layout.isMobileLayout ? 'Tap anywhere to unlock' : 'Click anywhere to unlock'}</div>
          {!layout.isMobileLayout && <div style={{ marginTop: 2 }}>← → to navigate events</div>}
        </div>
      ) : (
        !layout.isMobileLayout && (
          <div
            style={{
              fontSize: '0.85em',
              color: 'var(--text-tertiary)',
              marginTop: 6,
              lineHeight: 1.4,
            }}
          >
            <div>Click to lock</div>
          </div>
        )
      )}
    </div>
  );
}

function TooltipHeader({
  primaryAction,
  awayTeamNames,
  homeTeamNames,
  awayWinProb,
  shouldPositionBelow,
}) {
  const awayProbability = clampWinProbability(awayWinProb);
  const homeProbability = awayProbability === null ? null : 1 - awayProbability;

  return (
    <div className={`time-score-header ${shouldPositionBelow ? 'bottom' : 'top'}`}>
      <div className="headerRow">
        <span className="time">
          {formatPeriod(primaryAction.period)} {formatClock(primaryAction.clock)}
        </span>
        <span className="score">
          <span className="team-tricode away">{awayTeamNames.abr}</span>
          {primaryAction.scoreAway} - {primaryAction.scoreHome}
          <span className="team-tricode home">{homeTeamNames.abr}</span>
        </span>
      </div>
      {awayProbability !== null && homeProbability !== null && (
        <div className="tooltipOddsRow">
          <span className="label">Win Odds</span>
          <span className="oddsValue">
            <span className="team-tricode away">{awayTeamNames.abr}</span>{' '}
            {formatWinProbabilityPercent(awayProbability)}
            <span className="separator"></span>
            <span className="team-tricode home">{homeTeamNames.abr}</span>{' '}
            {formatWinProbabilityPercent(homeProbability)}
          </span>
        </div>
      )}
    </div>
  );
}

function TooltipActions({ descriptionArray, awayTeamNames, teamColors, renderItems }) {
  const nonSubActions = descriptionArray.filter((action) => !isSubstitutionAction(action));
  const pointActions = nonSubActions.filter(
    (action) =>
      !isFreeThrowAction(action.description, action.actionType) &&
      getEventType(action.description, action.actionType, action.result) === 'point',
  );
  const hasPoint = pointActions.length > 0;

  return (
    <div className="actions-container">
      {renderItems.map((item, index) => {
        const action = item.action;
        const eventType = item.isSubSummary
          ? null
          : getEventType(action.description, action.actionType, action.result);
        const isFreeThrow = item.isSubSummary
          ? false
          : isFreeThrowAction(action.description, action.actionType);
        const is3PT =
          !item.isSubSummary && isThreePointAction(action.description, action.actionType);
        const actionSide =
          action.side === 'away' || action.side === 'home'
            ? action.side
            : action.teamTricode === awayTeamNames.abr
              ? 'away'
              : 'home';
        const actionTeamColor =
          item.teamColor || (actionSide === 'away' ? teamColors.away : teamColors.home);
        const iconSize = 10;
        const iconPadding = 2;
        const iconViewSize = iconSize + iconPadding * 2;
        const iconCenter = iconViewSize / 2;

        const isOneOfOne = FREE_THROW_ONE_OF_ONE_PATTERN.test(
          `${action.subType || ''} ${action.description || ''}`,
        );
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
                    description: action.description,
                    subType: action.subType,
                    isAnd1,
                  })}
                </svg>
              ) : eventType ? (
                <LegendShape eventType={eventType} size={iconSize} is3PT={is3PT} />
              ) : (
                <span style={{ color: 'var(--line-color-light)', fontWeight: 'bold' }}>—</span>
              )}
            </span>
            <div className="action-description">{action.description}</div>
          </div>
        );
      })}
    </div>
  );
}

function LockedVideoLink({ videoUrl }) {
  return (
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
          gap: 6,
        }}
      >
        <span>Open video on nba.com</span>
        <ExternalLinkIcon />
      </a>
    </div>
  );
}
