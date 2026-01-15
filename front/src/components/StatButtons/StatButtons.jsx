import { EVENT_TYPES, LegendShape, renderFreeThrowRing } from '../../helpers/eventStyles.jsx';
import './StatButtons.scss';

export default function StatButtons({ statOn, changeStatOn, showScoreDiff, setShowScoreDiff, isLoading, statusMessage }) {

  const eventKeys = Object.keys(EVENT_TYPES);
  const isInteractive = !isLoading && !statusMessage;
  const handleToggle = (index) => {
    if (!isInteractive) return;
    changeStatOn(index);
  };

  const renderFreeThrowLegendIcon = (size = 10, isMiss = false) => {
    const padding = 2;
    const viewSize = size + padding * 2;
    const center = viewSize / 2;
    return (
      <svg
        width={viewSize}
        height={viewSize}
        viewBox={`0 0 ${viewSize} ${viewSize}`}
        style={{ display: 'inline-block', verticalAlign: 'middle' }}
      >
        {renderFreeThrowRing({
          cx: center,
          cy: center,
          size: size / 2,
          key: 'legend-ft-ring',
          description: isMiss ? 'MISS free throw 1 of 1' : 'free throw 1 of 1'
        })}
      </svg>
    );
  };

  const buttons = eventKeys.map((key, i) => {
    const isActive = statOn[i];
    const isPoint = key === 'point';
    const isMiss = key === 'miss';
    const pointLegendSize = 12;
    
    return (
      <div 
        className={`buttonGroup ${isActive ? '' : 'off'} ${isPoint || isMiss ? 'subLegend' : ''}`} 
        key={key}
        onClick={() => handleToggle(i)}
        aria-disabled={!isInteractive}
      >
        {isPoint ? (
          <div className="subLegendRow" aria-hidden="true">
            <div className="subLegendItem">
              <LegendShape eventType="point" size={pointLegendSize} />
              <span className="subLegendLabel">2PT</span>
            </div>
            <div className="subLegendItem">
              <LegendShape eventType="point" size={pointLegendSize} is3PT />
              <span className="subLegendLabel">3PT</span>
            </div>
            <div className="subLegendItem">
              {renderFreeThrowLegendIcon(pointLegendSize)}
              <span className="subLegendLabel">FT</span>
            </div>
          </div>
        ) : isMiss ? (
          <div className="subLegendRow" aria-hidden="true">
            <div className="subLegendItem">
              <LegendShape eventType="miss" size={pointLegendSize} />
              <span className="subLegendLabel">Miss</span>
            </div>
            <div className="subLegendItem">
              <LegendShape eventType="miss" size={pointLegendSize} is3PT />
              <span className="subLegendLabel">3PT</span>
            </div>
            <div className="subLegendItem">
              {renderFreeThrowLegendIcon(pointLegendSize, true)}
              <span className="subLegendLabel">FT</span>
            </div>
          </div>
        ) : (
          <>
            <div className="shapeContainer">
              <LegendShape eventType={key} size={18} />
            </div>
            <span className="label">{EVENT_TYPES[key].label}</span>
          </>
        )}
      </div>
    );
  });

  // Score differential toggle
  const scoreDiffButton = (
    <div 
      className={`buttonGroup scoreDiff ${showScoreDiff ? '' : 'off'}`}
      onClick={() => {
        if (!isInteractive) return;
        setShowScoreDiff(!showScoreDiff);
      }}
      aria-disabled={!isInteractive}
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
    <div className={`statButtons ${!isInteractive ? 'isLoading' : ''}`}>
      {buttons}
      <div className="separator" />
      {scoreDiffButton}
    </div>
  );
}
