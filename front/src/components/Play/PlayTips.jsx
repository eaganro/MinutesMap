import { TipCallout, TipDismissButton, TipFirstActions, TipRing } from '../tips/TipCallout';
import { measureRelative, useTipAnchor } from '../tips/useTipAnchor';
import './PlayTips.scss';

function measureAnchor(tip, container) {
  if (!container) return null;
  const base = {
    containerWidth: container.getBoundingClientRect().width,
    containerHeight: container.getBoundingClientRect().height,
  };

  if (tip === 'lines') {
    const line = container.querySelector('.playerTimeline');
    if (!line) return null;
    const rect = measureRelative(line, container);
    return {
      ...base,
      x: rect.left + Math.min(rect.width / 2, 48),
      y: rect.top + rect.height / 2,
    };
  }

  if (tip === 'explore') {
    const section = container.querySelector('.teamSection');
    if (!section) return null;
    const rect = measureRelative(section, container);
    return { ...base, y: rect.top + rect.height * 0.5 };
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
  leftMargin,
  timelineWidth,
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
    const sweepWidth = Math.max(timelineWidth, 0);
    return (
      <div className="tipLayer">
        <div
          className="playTipSweep"
          style={{
            left: leftMargin,
            top: anchor.y,
            width: sweepWidth,
            '--play-tip-sweep': `${Math.round(sweepWidth * 0.7)}px`,
          }}
          role="note"
        >
          <div className="tipAppear playTipLabel">Drag across the chart to see every play</div>
          <div className="playTipTrack">
            <span className="playTipFinger" aria-hidden="true" />
          </div>
        </div>
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
