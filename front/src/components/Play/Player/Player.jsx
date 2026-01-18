import { getSecondsElapsed } from '../../../helpers/playTimeline';
import { getEventType, isFreeThrowAction, renderEventShape, renderFreeThrowRing } from '../../../helpers/eventStyles.jsx';

import './Player.scss';

export default function Player({ actions, timeline, name, width, rightMargin = 0, heightDivide, highlight, leftMargin, timelineWindow }) {

  const playerName = name;
  const windowStartSeconds = timelineWindow?.startSeconds ?? 0;
  const windowDurationSeconds = timelineWindow?.durationSeconds ?? 0;

  const getXPosition = (period, clock) => {
    if (windowDurationSeconds <= 0) return 0;
    const elapsed = getSecondsElapsed(period, clock);
    const ratio = (elapsed - windowStartSeconds) / windowDurationSeconds;
    return Math.max(0, Math.min(width, ratio * width));
  };

  const filteredActions = actions
    .filter(a => a.actionType !== 'Substitution' && a.actionType !== 'Jump Ball' && a.actionType !== 'Violation');

  const freeThrowOneOfOnePattern = /free throw\s+1\s+of\s+1/i;
  const and1PointScale = 0.88;
  const and1MarkerScale = 0.5;
  const isOneOfOneFreeThrow = (action) => {
    const text = `${action.subType || ''} ${action.description || ''}`;
    return freeThrowOneOfOnePattern.test(text);
  };

  const pointAtTime = new Set();
  const freeThrowOneAtTime = new Set();
  filteredActions.forEach((action) => {
    const timeKey = `${action.period}|${action.clock}`;
    if (isFreeThrowAction(action.description, action.actionType)) {
      if (isOneOfOneFreeThrow(action)) {
        freeThrowOneAtTime.add(timeKey);
      }
      return;
    }
    if (getEventType(action.description, action.actionType) === 'point') {
      pointAtTime.add(timeKey);
    }
  });
  const and1AtTime = new Set(
    [...pointAtTime].filter(timeKey => freeThrowOneAtTime.has(timeKey))
  );
  
  const buildActionShapes = (actionList, size) => {
    const shapes = [];
    const freeThrowShapes = [];

    actionList.forEach((a) => {
      const pos = getXPosition(a.period, a.clock);
      const isFreeThrow = isFreeThrowAction(a.description, a.actionType);
      const timeKey = `${a.period}|${a.clock}`;

      if (isFreeThrow) {
        const isAnd1 = isOneOfOneFreeThrow(a) && pointAtTime.has(timeKey);
        const ring = renderFreeThrowRing({
          cx: pos,
          cy: 14,
          size,
          key: `action-${a.actionNumber}`,
          description: a.description,
          subType: a.subType,
          isAnd1,
          actionNumber: a.actionNumber,
          actionId: a.actionId
        });
        if (ring) {
          freeThrowShapes.push(ring);
        }
        return;
      }

      const eventType = getEventType(a.description, a.actionType);
      const is3PT = a.description.includes('3PT');
      const isAnd1Point = eventType === 'point' && and1AtTime.has(timeKey);
      const shapeSize = isAnd1Point ? size * and1PointScale : size;
      const markerScaleOverride = (isAnd1Point && is3PT) ? and1MarkerScale : null;
      const shape = renderEventShape(
        eventType,
        pos,
        14,
        shapeSize,
        `action-${a.actionNumber}`,
        is3PT,
        a.actionNumber,
        a.actionId,
        markerScaleOverride
      );
      if (shape) {
        shapes.push(shape);
      }
    });

    return shapes.concat(freeThrowShapes);
  };

  // Render non-highlighted dots first, then highlighted dots on top
  const nonHighlightedDots = buildActionShapes(
    filteredActions.filter(a => !highlight.includes(a.actionNumber)),
    4
  );
  
  const highlightedDots = buildActionShapes(
    filteredActions.filter(a => highlight.includes(a.actionNumber)),
    8
  );

  const playTimeLines = timeline?.filter(t => {
    if (!t.end) {
      console.log('PLAYER TIMELINE ERROR', name)
      return false;
    }
    return true;
  }).map((t, i) => {
    let x1 = getXPosition(t.period, t.start);
    let x2 = getXPosition(t.period, t.end);
    x2 = isNaN(x2) ? x1 : x2; 
    return (
      <line
        key={i}
        x1={x1}
        y1={14}
        x2={x2}
        y2={14}
        className="playerTimeline"
      />
    );
  });


  return (
    <div className='player' style={{ height: `${275/heightDivide}px`}}>
      <div className='playerName' style={{ width: 90 }}>{playerName}</div>
      <svg width={width + rightMargin} height="28" className='line' style={{left: leftMargin}}>
        {playTimeLines}
        {nonHighlightedDots}
        {highlightedDots}
      </svg>
    </div>
  );
}
