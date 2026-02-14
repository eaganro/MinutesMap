export const PLAY_LEFT_MARGIN = 96;
export const PLAY_RIGHT_MARGIN = 10;
export const MOBILE_TOOLTIP_BREAKPOINT = 700;

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function getTimelineWidth(
  sectionWidth,
  leftMargin = PLAY_LEFT_MARGIN,
  rightMargin = PLAY_RIGHT_MARGIN,
) {
  return Math.max(0, sectionWidth - (leftMargin + rightMargin));
}

export function getQuarterWidth(width, numPeriods) {
  const count = Number(numPeriods);
  if (!Number.isFinite(count) || count <= 0) {
    return width / 4;
  }
  if (count > 4) {
    return width * (12 / (12 * 4 + 5 * (count - 4)));
  }
  return width / count;
}

export function getScoreScale(scoreTimeline) {
  let maxLead = 0;
  (scoreTimeline || []).forEach((entry) => {
    const scoreDiff = Math.abs(Number(entry.away) - Number(entry.home));
    if (scoreDiff > maxLead) {
      maxLead = scoreDiff;
    }
  });

  return {
    maxLead,
    maxY: Math.floor(maxLead / 5) * 5 + 10,
  };
}

export function computeTooltipLayout({
  mousePosition,
  dimensions,
  containerRect,
  chartRect,
  viewportWidth,
  viewportHeight,
  leftMargin,
  infoLocked,
}) {
  const isMobileLayout = (containerRect?.width || viewportWidth) <= MOBILE_TOOLTIP_BREAKPOINT;
  const chartTop = chartRect?.top ?? containerRect?.top ?? 0;
  const chartBottom = chartRect?.bottom ?? containerRect?.bottom ?? viewportHeight;
  const chartCenterY = (chartTop + chartBottom) / 2;

  const shouldPositionLeft = !isMobileLayout && mousePosition.x > viewportWidth / 2;
  const shouldPositionBelow = isMobileLayout
    ? mousePosition.y < chartCenterY
    : mousePosition.y < viewportHeight / 2;

  let preferredLeft = shouldPositionLeft
    ? mousePosition.x - dimensions.width - 10
    : mousePosition.x + 10;
  let preferredTop = shouldPositionBelow
    ? mousePosition.y + 10
    : mousePosition.y - dimensions.height - 10;

  if (isMobileLayout) {
    preferredLeft = (viewportWidth - dimensions.width) / 2;
    preferredTop = shouldPositionBelow ? chartBottom - dimensions.height - 10 : chartTop + 10;
  }

  let finalLeft = preferredLeft;
  let finalTop = preferredTop;

  if (containerRect) {
    if (isMobileLayout) {
      const hoverPadding = 8;
      const minLeft = hoverPadding;
      const maxLeft = viewportWidth - dimensions.width - hoverPadding;
      const minTop = chartTop + hoverPadding;
      const maxTop = chartBottom - dimensions.height - hoverPadding;

      finalLeft = clamp(preferredLeft, minLeft, maxLeft);
      finalTop = clamp(preferredTop, minTop, maxTop);
    } else {
      const hoverPadding = 5;
      const minLeft = containerRect.left + leftMargin - hoverPadding;
      const maxLeft = containerRect.right - dimensions.width;
      const minTop = containerRect.top;
      const maxTop = containerRect.bottom - dimensions.height;

      finalLeft = clamp(preferredLeft, minLeft, maxLeft);
      finalTop = clamp(preferredTop, minTop, maxTop);
    }
  }

  const anchorToContainer = Boolean(containerRect) && (infoLocked || isMobileLayout);

  return {
    isMobileLayout,
    shouldPositionBelow,
    finalLeft,
    finalTop,
    anchorToContainer,
  };
}

export function buildTooltipStyle({
  containerRect,
  anchorToContainer,
  finalLeft,
  finalTop,
  width,
  infoLocked,
}) {
  const stylePos = anchorToContainer
    ? {
        position: 'absolute',
        left: finalLeft - (containerRect?.left ?? 0),
        top: finalTop - (containerRect?.top ?? 0),
      }
    : {
        position: 'fixed',
        left: finalLeft,
        top: finalTop,
      };

  return {
    ...stylePos,
    zIndex: 1000,
    width,
    pointerEvents: infoLocked ? 'auto' : 'none',
  };
}
