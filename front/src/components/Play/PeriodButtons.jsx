import { layoutPeriodButtons } from './model/periodButtonsLayout';

// Taps, drags and keys on the buttons are theirs, not the chart's (no scrubbing, no tooltip).
const keepFromChart = (event) => event.stopPropagation();

/**
 * The phone chart's period switch, in its top band: a button over each period's column in
 * the whole-game view, and Game plus every period once one is open.
 */
export default function PeriodButtons({
  activePeriod,
  periodOptions,
  timelineWindow,
  leftMargin,
  width,
  minX,
  latestStartedPeriod,
  disabled,
  onSelect,
}) {
  const buttons = layoutPeriodButtons({
    activePeriod,
    periodOptions,
    timelineWindow,
    leftMargin,
    width,
    minX,
  });
  if (!buttons.length) return null;

  return (
    <div
      className="playPeriodButtons"
      role="group"
      aria-label="Game or period"
      onClick={keepFromChart}
      onMouseDown={keepFromChart}
      onMouseMove={keepFromChart}
      onTouchStart={keepFromChart}
      onTouchMove={keepFromChart}
      onTouchEnd={keepFromChart}
      onKeyDown={keepFromChart}
      onFocus={keepFromChart}
      onBlur={keepFromChart}
    >
      {buttons.map(({ period, label, x0, x1 }) => {
        const isActive = Boolean(activePeriod) && period === activePeriod;
        return (
          <button
            key={period}
            type="button"
            className={`playPeriodButton${isActive ? ' isActive' : ''}`}
            style={{ left: x0, width: x1 - x0 }}
            onClick={() => onSelect(period, label)}
            disabled={disabled || (period !== 0 && period > latestStartedPeriod)}
            aria-pressed={isActive}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
