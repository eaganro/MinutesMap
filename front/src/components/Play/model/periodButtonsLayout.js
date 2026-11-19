import { getPeriodDurationSeconds, getPeriodStartSeconds } from '../../../helpers/playTimeline';

// Space between neighbouring buttons.
export const PERIOD_BUTTON_GAP = 4;
// Narrow enough for a 3OT game on a small phone, wide enough for "O3".
export const PERIOD_BUTTON_MIN_WIDTH = 20;

/**
 * Where the period buttons go in the chart's top band, in chart x coordinates.
 *
 * - Whole game (activePeriod 0): one button per period on screen, over that period's
 *   column. A column too narrow for a button (an overtime on a small phone, or a live
 *   period that has only just started) takes the room from the one before it.
 * - One period open: Game and every period, evenly spaced across the same span, so the
 *   buttons cover only the timeline in both views and stay clear of the team name.
 *
 * `minX` is where the team name ends; buttons start no further left.
 * `periodOptions` is [{ period, label }] with Game as period 0.
 */
export function layoutPeriodButtons({
  activePeriod,
  periodOptions,
  timelineWindow,
  leftMargin,
  width,
  minX = 0,
}) {
  const right = leftMargin + width;
  if (!periodOptions?.length || !(width > 0)) return [];

  if (activePeriod) {
    const left = Math.max(leftMargin, minX) + PERIOD_BUTTON_GAP / 2;
    const count = periodOptions.length;
    const buttonWidth =
      (right - PERIOD_BUTTON_GAP / 2 - left - PERIOD_BUTTON_GAP * (count - 1)) / count;
    return periodOptions.map(({ period, label }, index) => {
      const x0 = left + index * (buttonWidth + PERIOD_BUTTON_GAP);
      return { period, label, x0, x1: x0 + buttonWidth };
    });
  }

  const startSeconds = timelineWindow?.startSeconds ?? 0;
  const durationSeconds = timelineWindow?.durationSeconds ?? 0;
  if (durationSeconds <= 0) return [];
  const endSeconds = startSeconds + durationSeconds;
  const toX = (seconds) => leftMargin + ((seconds - startSeconds) / durationSeconds) * width;

  const buttons = [];
  periodOptions.forEach(({ period, label }) => {
    if (!period) return;
    const periodStart = getPeriodStartSeconds(period);
    const visibleStart = Math.max(periodStart, startSeconds);
    const visibleEnd = Math.min(periodStart + getPeriodDurationSeconds(period), endSeconds);
    if (visibleEnd <= visibleStart) return;
    buttons.push({
      period,
      label,
      x0: Math.max(toX(visibleStart), minX) + PERIOD_BUTTON_GAP / 2,
      x1: toX(visibleEnd) - PERIOD_BUTTON_GAP / 2,
    });
  });

  for (let index = buttons.length - 1; index > 0; index -= 1) {
    const button = buttons[index];
    if (button.x1 - button.x0 < PERIOD_BUTTON_MIN_WIDTH) {
      button.x0 = button.x1 - PERIOD_BUTTON_MIN_WIDTH;
    }
    const previous = buttons[index - 1];
    previous.x1 = Math.min(previous.x1, button.x0 - PERIOD_BUTTON_GAP);
  }
  return buttons;
}
