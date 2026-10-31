import { TipCallout, TipDismissButton, TipFirstActions, TipRing } from '../../tips/TipCallout';
import { measureRelative, useTipAnchor } from '../../tips/useTipAnchor';

const TIP_TARGETS = {
  view: '.playExportViewOption select',
  range: '.playExportRange',
  caption: '.playExportCaptionOption textarea',
};

function measureAnchor(tip, container) {
  const target = container?.querySelector(TIP_TARGETS[tip]);
  if (!target) return null;
  const containerRect = container.getBoundingClientRect();
  return {
    containerWidth: containerRect.width,
    containerHeight: containerRect.height,
    rect: measureRelative(target, container),
  };
}

export default function PlayExportTips({
  activeTip,
  previewRef,
  layoutKey,
  hasCaptionedPeriods,
  onDismiss,
  onSkip,
}) {
  const anchor = useTipAnchor({
    activeTip,
    containerRef: previewRef,
    measure: measureAnchor,
    layoutKey,
  });

  if (!activeTip || !anchor) return null;
  const { rect } = anchor;
  const anchorX = rect.left + Math.min(rect.width / 2, 48);
  const calloutTop = rect.top + rect.height + 12;

  if (activeTip === 'view') {
    return (
      <div className="tipLayer">
        <TipRing rect={rect} />
        <TipCallout anchorX={anchorX} top={calloutTop} containerWidth={anchor.containerWidth}>
          <p className="tipText">
            Pick a layout: the whole game&apos;s timeline, or one player&apos;s minutes and plays on
            their own.
          </p>
          <TipFirstActions onDone={() => onDismiss('view')} onSkip={onSkip} />
        </TipCallout>
      </div>
    );
  }

  if (activeTip === 'range') {
    return (
      <div className="tipLayer">
        <TipRing rect={rect} />
        <TipCallout
          anchorX={anchorX}
          top={calloutTop}
          containerWidth={anchor.containerWidth}
          className="hasClose"
        >
          <p className="tipText">
            Choose which quarters the image covers.
            {hasCaptionedPeriods && ' End on one marked [caption] to get a ready-made caption.'}
          </p>
          <TipDismissButton onClick={() => onDismiss('range')} />
        </TipCallout>
      </div>
    );
  }

  if (activeTip === 'caption') {
    return (
      <div className="tipLayer">
        <TipRing rect={rect} />
        <TipCallout
          anchorX={anchorX}
          // Sit above the box so the preview image below stays in view.
          bottom={anchor.containerHeight - rect.top + 12}
          containerWidth={anchor.containerWidth}
          className="hasClose isAbove"
        >
          <p className="tipText">
            Edit the caption or write your own, then press Update caption to put it on the image.
          </p>
          <TipDismissButton onClick={() => onDismiss('caption')} />
        </TipCallout>
      </div>
    );
  }

  return null;
}
