// Short names on narrower charts (see Player.scss): shown at 9.5px, shrunk as far as
// 8px for a name that is only a little too long. One that still doesn't fit is cut
// off with a fade rather than "…", which would take up a letter or two of the column.
export const COMPACT_NAME_FONT_PX = 9.5;
export const COMPACT_NAME_MIN_FONT_PX = 8;
// Names go bold on hover, which makes them wider.
export const NAME_WEIGHT = 500;
export const NAME_EMPHASIS_WEIGHT = 700;

// Leaves a little room, since text doesn't shrink exactly in proportion to its size.
const FIT_SLACK_PX = 0.5;

// widths: the name's width at COMPACT_NAME_FONT_PX, normal and bold.
export function fitCompactName({ width, emphasisWidth, maxWidth }) {
  if (!(width > 0) || !(maxWidth > 0)) return null;
  const target = maxWidth - FIT_SLACK_PX;
  const fontSize =
    width <= maxWidth
      ? COMPACT_NAME_FONT_PX
      : Math.max(
          COMPACT_NAME_MIN_FONT_PX,
          Math.floor(((COMPACT_NAME_FONT_PX * target) / width) * 10) / 10,
        );
  const scale = fontSize / COMPACT_NAME_FONT_PX;
  return {
    fontSize,
    isClipped: width * scale > maxWidth,
    isEmphasisClipped: (emphasisWidth || width) * scale > maxWidth,
  };
}

// Measures the name as rendered, in both weights, at the starting size.
export function measureCompactName(textElement) {
  const { style } = textElement;
  style.fontSize = `${COMPACT_NAME_FONT_PX}px`;
  style.fontWeight = String(NAME_WEIGHT);
  const width = textElement.getBoundingClientRect().width;
  style.fontWeight = String(NAME_EMPHASIS_WEIGHT);
  const emphasisWidth = textElement.getBoundingClientRect().width;
  style.fontSize = '';
  style.fontWeight = '';
  return { width, emphasisWidth };
}
