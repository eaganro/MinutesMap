import './Tips.scss';

const CALLOUT_MAX_WIDTH = 260;
const CALLOUT_EDGE_GAP = 8;
const ARROW_INSET = 14;

// Keep taps, clicks and pointer moves on a tip from reaching the section underneath (the
// play-by-play chart reacts to all of them).
const stopEvent = (event) => event.stopPropagation();
const eventGuards = {
  onClick: stopEvent,
  onMouseMove: stopEvent,
  onTouchStart: stopEvent,
  onTouchMove: stopEvent,
  onTouchEnd: stopEvent,
};

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

/**
 * A tip box with an arrow at `anchorX`, placed below a target (`top`) or above it
 * (`bottom`, with the `isAbove` class). Positions are relative to the tip layer.
 */
export function TipCallout({
  anchorX,
  top,
  bottom,
  containerWidth,
  onMouseEnter,
  children,
  className = '',
}) {
  const width = Math.min(CALLOUT_MAX_WIDTH, containerWidth - CALLOUT_EDGE_GAP * 2);
  const left = clamp(anchorX - 32, CALLOUT_EDGE_GAP, containerWidth - width - CALLOUT_EDGE_GAP);
  const arrowLeft = clamp(anchorX - left, ARROW_INSET, width - ARROW_INSET);

  return (
    <div
      className={`tipAppear tipCallout ${className}`}
      style={{ left, width, ...(bottom === undefined ? { top } : { bottom }) }}
      role="note"
      {...eventGuards}
      onMouseEnter={onMouseEnter}
    >
      <span className="tipArrow" style={{ left: arrowLeft }} aria-hidden="true" />
      {children}
    </div>
  );
}

/** A pulsing outline around a target rect. */
export function TipRing({ rect, className = '' }) {
  return (
    <span
      className={`tipRing ${className}`}
      style={{
        left: rect.left - 3,
        top: rect.top - 3,
        width: rect.width + 6,
        height: rect.height + 6,
      }}
      aria-hidden="true"
    />
  );
}

/** Buttons for the first tip in a sequence, which has no action of its own to wait for. */
export function TipFirstActions({ onDone, onSkip }) {
  return (
    <div className="tipActions">
      <button type="button" className="tipSkip" onClick={onSkip}>
        Skip tips
      </button>
      <button type="button" className="tipPrimary" onClick={onDone}>
        Got it
      </button>
    </div>
  );
}

export function TipDismissButton({ onClick }) {
  return (
    <button type="button" className="tipClose" onClick={onClick} aria-label="Dismiss tip">
      ×
    </button>
  );
}
