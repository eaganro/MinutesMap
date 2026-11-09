import { TipCallout, TipDismissButton, TipFirstActions, TipRing } from '../tips/TipCallout';
import { measureRelative, useTipAnchor } from '../tips/useTipAnchor';
import './PlayTips.scss';

// Shorter sweeps than this don't read as a drag, so the finger just sits on the line.
const MIN_SWEEP_PX = 40;

function measureAnchor(tip, container) {
  if (!container) return null;
  const base = {
    containerWidth: container.getBoundingClientRect().width,
    containerHeight: container.getBoundingClientRect().height,
  };

  if (tip === 'lines' || tip === 'explore') {
    const lines = Array.from(container.querySelectorAll('.playerTimeline'));
    if (!lines.length) return null;
    const rect = measureRelative(lines[0], container);
    const x = rect.left + Math.min(rect.width / 2, 48);
    const anchor = { ...base, x, y: rect.top + rect.height / 2 };
    if (tip === 'lines') return anchor;

    // Sweep only as far as the lines go, since a live game's current quarter is mostly empty.
    const linesRight = lines.reduce((right, line) => {
      const lineRect = measureRelative(line, container);
      return Math.max(right, lineRect.left + lineRect.width);
    }, 0);
    const sweep = linesRight - x;
    return { ...anchor, sweep: sweep >= MIN_SWEEP_PX ? Math.round(sweep) : 0 };
  }

  if (tip === 'player') {
    const name = container.querySelector('.playerNameButton');
    if (!name) return null;
    return { ...base, rect: measureRelative(name, container) };
  }

  if (tip === 'stats') {
    // The legend sits below the chart, outside this container. Point at a stat that is
    // currently off, since turning one on is the clearest first try.
    const legend = document.querySelector('.statButtons');
    const chip = legend?.querySelector('.buttonGroup.off') || legend?.querySelector('.buttonGroup');
    if (!chip) return null;
    return {
      ...base,
      legendTop: measureRelative(legend, container).top,
      rect: measureRelative(chip, container),
    };
  }

  return null;
}

export default function PlayTips({
  activeTip,
  playRef,
  layoutKey,
  isFinePointer,
  onCalloutHover,
  onDismiss,
  onSkip,
}) {
  const anchor = useTipAnchor({
    activeTip,
    containerRef: playRef,
    measure: measureAnchor,
    layoutKey,
  });

  if (!activeTip || !anchor) return null;

  if (activeTip === 'lines') {
    return (
      <div className="tipLayer">
        <span className="tipPulse" style={{ left: anchor.x, top: anchor.y }} aria-hidden="true" />
        <TipCallout
          anchorX={anchor.x}
          top={anchor.y + 14}
          containerWidth={anchor.containerWidth}
          onMouseEnter={onCalloutHover}
        >
          <p className="tipText">
            Each line shows when a player was on the court. The shapes on it are their plays.
            {isFinePointer && ' Hover over the chart to see each play, and click to pin one.'}
          </p>
          <TipFirstActions onDone={() => onDismiss('lines')} onSkip={onSkip} />
        </TipCallout>
      </div>
    );
  }

  if (activeTip === 'explore') {
    // Touch screens: the first tip also asks for the drag, and a finger sweeps along the line
    // it points at. Drags that start on the tip's text reach the chart (see isPassThrough).
    return (
      <div className="tipLayer">
        <span
          className={`playTipFinger${anchor.sweep ? ' isSweeping' : ''}`}
          style={{ left: anchor.x, top: anchor.y, '--play-tip-sweep': `${anchor.sweep}px` }}
          aria-hidden="true"
        />
        <TipCallout
          anchorX={anchor.x}
          top={anchor.y + 16}
          containerWidth={anchor.containerWidth}
          className="isPassThrough"
        >
          <p className="tipText">
            Each line shows when a player was on the court. The shapes on it are their plays.{' '}
            <strong>Drag across the chart to see each one.</strong>
          </p>
          <TipFirstActions onDone={() => onDismiss('explore')} onSkip={onSkip} />
        </TipCallout>
      </div>
    );
  }

  if (activeTip === 'player') {
    const { rect } = anchor;
    return (
      <div className="tipLayer">
        <TipRing rect={rect} />
        <TipCallout
          anchorX={rect.left + Math.min(rect.width / 2, 40)}
          top={rect.top + rect.height + 12}
          containerWidth={anchor.containerWidth}
          onMouseEnter={onCalloutHover}
          className="hasClose"
        >
          <p className="tipText">Tap a player&apos;s name to see their whole game</p>
          <TipDismissButton onClick={() => onDismiss('player')} />
        </TipCallout>
      </div>
    );
  }

  if (activeTip === 'stats') {
    const { rect } = anchor;
    return (
      <div className="tipLayer">
        <TipRing rect={rect} className="isPill" />
        <TipCallout
          anchorX={rect.left + rect.width / 2}
          // Sit above the whole legend so it never covers a row of chips; the ring marks the chip.
          bottom={anchor.containerHeight - Math.min(anchor.legendTop, rect.top) + 12}
          containerWidth={anchor.containerWidth}
          onMouseEnter={onCalloutHover}
          className="hasClose isAbove"
        >
          <p className="tipText">
            {isFinePointer ? 'Click' : 'Tap'} these to show or hide stats on the chart. Hold one to
            show only that stat.
          </p>
          <TipDismissButton onClick={() => onDismiss('stats')} />
        </TipCallout>
      </div>
    );
  }

  return null;
}
