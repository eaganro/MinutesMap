import { describe, expect, it } from 'vitest';
import { COMPACT_NAME_FONT_PX, COMPACT_NAME_MIN_FONT_PX, fitCompactName } from './nameFit';

describe('fitCompactName', () => {
  it('keeps a name that fits at full size', () => {
    expect(fitCompactName({ width: 28, emphasisWidth: 30, maxWidth: 36 })).toEqual({
      fontSize: COMPACT_NAME_FONT_PX,
      isClipped: false,
      isEmphasisClipped: false,
    });
  });

  it('shrinks a name that is a little too long until it fits', () => {
    const fit = fitCompactName({ width: 40, emphasisWidth: 42, maxWidth: 36 });
    expect(fit.fontSize).toBeLessThan(COMPACT_NAME_FONT_PX);
    expect(fit.fontSize).toBeGreaterThanOrEqual(COMPACT_NAME_MIN_FONT_PX);
    expect((40 * fit.fontSize) / COMPACT_NAME_FONT_PX).toBeLessThanOrEqual(36);
    expect(fit.isClipped).toBe(false);
  });

  it('stops shrinking at the minimum size and fades the rest', () => {
    expect(fitCompactName({ width: 69, emphasisWidth: 73, maxWidth: 36 })).toEqual({
      fontSize: COMPACT_NAME_MIN_FONT_PX,
      isClipped: true,
      isEmphasisClipped: true,
    });
  });

  it('notes a name that only overflows once it goes bold', () => {
    const fit = fitCompactName({ width: 35, emphasisWidth: 38, maxWidth: 36 });
    expect(fit.fontSize).toBe(COMPACT_NAME_FONT_PX);
    expect(fit.isClipped).toBe(false);
    expect(fit.isEmphasisClipped).toBe(true);
  });

  it('leaves the name alone when it could not be measured', () => {
    expect(fitCompactName({ width: 0, emphasisWidth: 0, maxWidth: 36 })).toBeNull();
  });
});
