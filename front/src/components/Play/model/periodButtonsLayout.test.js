import { describe, expect, it } from 'vitest';
import {
  PERIOD_BUTTON_GAP,
  PERIOD_BUTTON_MIN_WIDTH,
  layoutPeriodButtons,
} from './periodButtonsLayout';

const options = (labels) => [
  { period: 0, label: 'Game' },
  ...labels.map((label, index) => ({ period: index + 1, label })),
];
const REGULATION = options(['Q1', 'Q2', 'Q3', 'Q4']);
const TRIPLE_OT = options(['Q1', 'Q2', 'Q3', 'Q4', 'O1', 'O2', 'O3']);
const wholeGame = (seconds) => ({ startSeconds: 0, durationSeconds: seconds });

describe('layoutPeriodButtons', () => {
  it('puts one button over each quarter in the whole-game view, without Game', () => {
    const buttons = layoutPeriodButtons({
      activePeriod: 0,
      periodOptions: REGULATION,
      timelineWindow: wholeGame(48 * 60),
      leftMargin: 50,
      width: 320,
    });

    expect(buttons.map((b) => b.label)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(buttons[0].x0).toBe(50 + PERIOD_BUTTON_GAP / 2);
    expect(buttons[1].x0).toBe(130 + PERIOD_BUTTON_GAP / 2);
    expect(buttons[3].x1).toBe(370 - PERIOD_BUTTON_GAP / 2);
  });

  it('keeps overtime buttons in their short columns, at least the minimum wide', () => {
    const buttons = layoutPeriodButtons({
      activePeriod: 0,
      periodOptions: TRIPLE_OT,
      timelineWindow: wholeGame(63 * 60),
      leftMargin: 50,
      width: 290,
    });

    expect(buttons.map((b) => b.label)).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'O1', 'O2', 'O3']);
    buttons.forEach((button, index) => {
      expect(button.x1 - button.x0).toBeGreaterThanOrEqual(PERIOD_BUTTON_MIN_WIDTH - 1e-9);
      if (index)
        expect(button.x0 - buttons[index - 1].x1).toBeGreaterThanOrEqual(PERIOD_BUTTON_GAP);
    });
    expect(buttons[6].x1).toBeCloseTo(340 - PERIOD_BUTTON_GAP / 2);
  });

  it('gives a live period that has barely started room taken from the one before', () => {
    // Q2 has a minute on screen: 12 + 1 minutes across 260px.
    const buttons = layoutPeriodButtons({
      activePeriod: 0,
      periodOptions: REGULATION,
      timelineWindow: wholeGame(13 * 60),
      leftMargin: 40,
      width: 260,
    });

    expect(buttons.map((b) => b.label)).toEqual(['Q1', 'Q2']);
    expect(buttons[1].x1 - buttons[1].x0).toBe(PERIOD_BUTTON_MIN_WIDTH);
    expect(buttons[1].x0 - buttons[0].x1).toBe(PERIOD_BUTTON_GAP);
  });

  it('keeps the first button clear of the team name', () => {
    const buttons = layoutPeriodButtons({
      activePeriod: 0,
      periodOptions: REGULATION,
      timelineWindow: wholeGame(48 * 60),
      leftMargin: 30,
      width: 320,
      minX: 52,
    });

    expect(buttons[0].x0).toBe(52 + PERIOD_BUTTON_GAP / 2);
  });

  it('spaces Game and every period evenly over the whole-game span once a period is open', () => {
    const buttons = layoutPeriodButtons({
      activePeriod: 2,
      periodOptions: TRIPLE_OT,
      timelineWindow: { startSeconds: 720, durationSeconds: 720 },
      leftMargin: 50,
      width: 300,
      minX: 46,
    });

    expect(buttons.map((b) => b.label)).toEqual(['Game', 'Q1', 'Q2', 'Q3', 'Q4', 'O1', 'O2', 'O3']);
    // From where Q1 starts in the whole-game view (past the team name) to where it ends.
    expect(buttons[0].x0).toBe(50 + PERIOD_BUTTON_GAP / 2);
    expect(buttons[7].x1).toBeCloseTo(350 - PERIOD_BUTTON_GAP / 2);
    const widths = buttons.map((b) => b.x1 - b.x0);
    widths.forEach((w) => expect(w).toBeCloseTo(widths[0]));
  });
});
