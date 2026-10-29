import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

/**
 * Where the active tip should point, from `measure(tip, container)` (positions relative to
 * `containerRef`). Re-measures when `layoutKey` changes, when the container resizes or the
 * window does, and on every render while the target hasn't appeared yet.
 */
export function useTipAnchor({ activeTip, containerRef, measure, layoutKey }) {
  const [anchor, setAnchor] = useState(null);

  const update = useCallback(() => {
    const measured = activeTip ? measure(activeTip, containerRef.current) : null;
    setAnchor(measured ? { ...measured, tip: activeTip } : null);
  }, [activeTip, containerRef, measure]);

  // Right after one tip hands over to the next, the stored anchor still belongs to the
  // previous tip (each tip measures different things), so never hand it to the new one.
  const currentAnchor = anchor?.tip === activeTip ? anchor : null;

  useLayoutEffect(() => {
    update();
  }, [update, layoutKey]);

  // What a tip points at can appear a render later (e.g. the stat legend returns only after
  // the player detail view closes), so keep looking until it is there.
  useLayoutEffect(() => {
    if (activeTip && !currentAnchor) update();
  });

  useEffect(() => {
    if (!activeTip) return undefined;
    window.addEventListener('resize', update);
    const node = containerRef.current;
    let observer = null;
    if (node && typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(() => update());
      observer.observe(node);
    }
    return () => {
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, [activeTip, containerRef, update]);

  return currentAnchor;
}

/** Measures `element` relative to `container`. */
export function measureRelative(element, container) {
  const rect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return {
    left: rect.left - containerRect.left,
    top: rect.top - containerRect.top,
    width: rect.width,
    height: rect.height,
  };
}
