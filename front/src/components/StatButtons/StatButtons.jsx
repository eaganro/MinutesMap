import { EVENT_TYPES, LegendShape } from '../../helpers/eventStyles.jsx';
import './StatButtons.scss';

export default function StatButtons({ statOn, changeStatOn, showScoreDiff, setShowScoreDiff, isLoading, statusMessage }) {

  const eventKeys = Object.keys(EVENT_TYPES);
  const isReady = !isLoading && !statusMessage;

  const buttons = eventKeys.map((key, i) => {
    if (!isReady) {
      return <div key={key}></div>;
    }
    
    const isActive = statOn[i];
    
    return (
      <div 
        className={`buttonGroup ${isActive ? '' : 'off'}`} 
        key={key}
        onClick={() => changeStatOn(i)}
      >
        <div className="shapeContainer">
          <LegendShape eventType={key} size={18} />
        </div>
        <span className="label">{EVENT_TYPES[key].label}</span>
      </div>
    );
  });

  // Score differential toggle
  const scoreDiffButton = isReady && (
    <div 
      className={`buttonGroup scoreDiff ${showScoreDiff ? '' : 'off'}`}
      onClick={() => setShowScoreDiff(!showScoreDiff)}
    >
      <div className="shapeContainer scoreDiffIcon">
        <svg width="18" height="18" viewBox="0 0 18 18">
          <path 
            d="M1 9 L5 5 L9 9 L13 4 L17 7" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path 
            d="M1 9 L5 5 L9 9 L13 4 L17 7 L17 14 L1 14 Z" 
            fill="currentColor" 
            opacity="0.3"
          />
        </svg>
      </div>
      <span className="label">Score Lead</span>
    </div>
  );

  return (
    <div className='statButtons'>
      {buttons}
      {isReady && <div className="separator" />}
      {scoreDiffButton}
    </div>
  );
}
