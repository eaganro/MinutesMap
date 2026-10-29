import { TipCallout, TipDismissButton, TipFirstActions, TipRing } from '../tips/TipCallout';
import { measureRelative, useTipAnchor } from '../tips/useTipAnchor';

const FIRST_LINEUP_ROW = '.lineupsTable .lineupsRow:not(.lineupsRowHeader):not(.lineupsRowSummary)';

function measureAnchor(tip, container) {
  if (!container) return null;
  const row = container.querySelector(FIRST_LINEUP_ROW);
  const target = tip === 'filter' ? row?.querySelector('.lineupsPill') : row;
  if (!target) return null;
  return {
    containerWidth: container.getBoundingClientRect().width,
    rect: measureRelative(target, container),
  };
}

export default function LineupsTips({
  activeTip,
  lineupsRef,
  layoutKey,
  isFinePointer,
  onDismiss,
  onSkip,
}) {
  const anchor = useTipAnchor({
    activeTip,
    containerRef: lineupsRef,
    measure: measureAnchor,
    layoutKey,
  });

  if (!activeTip || !anchor) return null;
  const { rect } = anchor;
  const calloutTop = rect.top + rect.height + 12;

  if (activeTip === 'rows') {
    return (
      <div className="tipLayer">
        <TipRing rect={rect} />
        <TipCallout
          anchorX={rect.left + Math.min(rect.width / 2, 60)}
          top={calloutTop}
          containerWidth={anchor.containerWidth}
        >
          <p className="tipText">
            Each row is a group of five that played together: how long they were on the court and
            how much they outscored the other team (+/-).
          </p>
          <TipFirstActions onDone={() => onDismiss('rows')} onSkip={onSkip} />
        </TipCallout>
      </div>
    );
  }

  if (activeTip === 'filter') {
    return (
      <div className="tipLayer">
        <TipRing rect={rect} className="isPill" />
        <TipCallout
          anchorX={rect.left + rect.width / 2}
          top={calloutTop}
          containerWidth={anchor.containerWidth}
          className="hasClose"
        >
          <p className="tipText">
            {isFinePointer ? 'Click' : 'Tap'} a player to see only the lineups they were in. Pick up
            to 5.
          </p>
          <TipDismissButton onClick={() => onDismiss('filter')} />
        </TipCallout>
      </div>
    );
  }

  return null;
}
