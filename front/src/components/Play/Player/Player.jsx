import { getSecondsElapsed } from '../../../helpers/playTimeline';
import { getEventType, renderEventShape } from '../../../helpers/eventStyles.jsx';

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
  
  // Render non-highlighted dots first, then highlighted dots on top
  const nonHighlightedDots = filteredActions
    .filter(a => !highlight.includes(a.actionNumber))
    .map(a => {
      const pos = getXPosition(a.period, a.clock);
      const eventType = getEventType(a.description, a.actionType);
      const is3PT = a.description.includes('3PT');
      return renderEventShape(eventType, pos, 14, 4, `action-${a.actionNumber}`, is3PT, a.actionNumber);
    });
  
  const highlightedDots = filteredActions
    .filter(a => highlight.includes(a.actionNumber))
    .map(a => {
      const pos = getXPosition(a.period, a.clock);
      const eventType = getEventType(a.description, a.actionType);
      const is3PT = a.description.includes('3PT');
      return renderEventShape(eventType, pos, 14, 8, `action-${a.actionNumber}`, is3PT, a.actionNumber);
    });

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
    return <line key={i} x1={x1} y1={14} x2={x2} y2={14} style={{ stroke: 'var(--line-color-light)', strokeWidth: 1.5 }} />
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
