import { timeToSeconds } from '../../../helpers/utils';
import { getEventType, renderEventShape } from '../../../helpers/eventStyles.jsx';

import './Player.scss';

export default function Player({ actions, timeline, name, width, rightMargin = 0, numQs, heightDivide, highlight, leftMargin }) {

  const playerName = name;

  let qWidth = width / 4;
  if (numQs > 4) {
    qWidth = width * (12 / (12 * 4 + 5 * (numQs - 4)))
  }

  const filteredActions = actions
    .filter(a => a.actionType !== 'Substitution' && a.actionType !== 'Jump Ball' && a.actionType !== 'Violation');
  
  // Render non-highlighted dots first, then highlighted dots on top
  const nonHighlightedDots = filteredActions
    .filter(a => !highlight.includes(a.actionNumber))
    .map(a => {
      let pos = (((a.period - 1) * 12 * 60 + 12 * 60 - timeToSeconds(a.clock)) / (4 * 12 * 60)) * (qWidth * 4);
      if (a.period > 4) {
        pos = ((4 * 12 * 60 + 5 * (a.period - 4) * 60 - timeToSeconds(a.clock)) / (4 * 12 * 60)) * (qWidth * 4);
      }
      const eventType = getEventType(a.description, a.actionType);
      const is3PT = a.description.includes('3PT');
      return renderEventShape(eventType, pos, 14, 4, `action-${a.actionNumber}`, is3PT, a.actionNumber);
    });
  
  const highlightedDots = filteredActions
    .filter(a => highlight.includes(a.actionNumber))
    .map(a => {
      let pos = (((a.period - 1) * 12 * 60 + 12 * 60 - timeToSeconds(a.clock)) / (4 * 12 * 60)) * (qWidth * 4);
      if (a.period > 4) {
        pos = ((4 * 12 * 60 + 5 * (a.period - 4) * 60 - timeToSeconds(a.clock)) / (4 * 12 * 60)) * (qWidth * 4);
      }
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
    let x1 = (((t.period - 1) * 12 * 60 + 12 * 60 - timeToSeconds(t.start)) / (4 * 12 * 60)) * (qWidth * 4);
    if (t.period > 4) {
      x1 = ((4 * 12 * 60 + 5 * (t.period - 4) * 60 - timeToSeconds(t.start)) / (4 * 12 * 60)) * (qWidth * 4);
    }
    let x2 = (((t.period - 1) * 12 * 60 + 12 * 60 - timeToSeconds(t.end)) / (4 * 12 * 60)) * (qWidth * 4);
    if (t.period > 4) {
      x2 = ((4 * 12 * 60 + 5 * (t.period - 4) * 60 - timeToSeconds(t.end)) / (4 * 12 * 60)) * (qWidth * 4);
    }
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
