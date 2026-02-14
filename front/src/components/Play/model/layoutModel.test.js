import { describe, expect, it } from 'vitest';
import {
  buildTooltipStyle,
  computeTooltipLayout,
  getQuarterWidth,
  getScoreScale,
} from './layoutModel';

describe('layoutModel', () => {
  it('computes quarter width and score scale values', () => {
    expect(getQuarterWidth(400, 1)).toBe(400);
    expect(getQuarterWidth(400, 4)).toBe(100);
    expect(getQuarterWidth(400, 5)).toBeCloseTo(90.56, 1);

    const scale = getScoreScale([
      { away: 10, home: 12 },
      { away: 30, home: 12 },
    ]);
    expect(scale).toEqual({ maxLead: 18, maxY: 25 });
  });

  it('positions desktop tooltip as fixed and clamps inside container bounds', () => {
    const layout = computeTooltipLayout({
      mousePosition: { x: 980, y: 90 },
      dimensions: { width: 300, height: 120 },
      containerRect: { left: 100, right: 900, top: 40, bottom: 480, width: 800 },
      chartRect: { top: 70, bottom: 420 },
      viewportWidth: 1200,
      viewportHeight: 800,
      leftMargin: 96,
      infoLocked: false,
    });

    expect(layout.isMobileLayout).toBe(false);
    expect(layout.anchorToContainer).toBe(false);
    expect(layout.finalLeft).toBeGreaterThanOrEqual(191);

    const style = buildTooltipStyle({
      containerRect: { left: 100, top: 40 },
      anchorToContainer: layout.anchorToContainer,
      finalLeft: layout.finalLeft,
      finalTop: layout.finalTop,
      width: 300,
      infoLocked: false,
    });

    expect(style.position).toBe('fixed');
  });

  it('positions mobile tooltip anchored to container', () => {
    const layout = computeTooltipLayout({
      mousePosition: { x: 220, y: 120 },
      dimensions: { width: 280, height: 110 },
      containerRect: { left: 0, right: 500, top: 100, bottom: 600, width: 500 },
      chartRect: { top: 200, bottom: 580 },
      viewportWidth: 500,
      viewportHeight: 900,
      leftMargin: 96,
      infoLocked: false,
    });

    expect(layout.isMobileLayout).toBe(true);
    expect(layout.anchorToContainer).toBe(true);

    const style = buildTooltipStyle({
      containerRect: { left: 0, top: 100 },
      anchorToContainer: layout.anchorToContainer,
      finalLeft: layout.finalLeft,
      finalTop: layout.finalTop,
      width: 280,
      infoLocked: false,
    });

    expect(style.position).toBe('absolute');
  });
});
