import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StatButtons from './StatButtons';

const STAT_ON = [true, true, true, true, true, true, true, true];

const renderStatButtons = (overrides = {}) =>
  render(
    <StatButtons
      statOn={STAT_ON}
      changeStatOn={vi.fn()}
      showScoreDiff
      setShowScoreDiff={vi.fn()}
      showOdds={false}
      setShowOdds={vi.fn()}
      isLoading={false}
      statusMessage={null}
      {...overrides}
    />,
  );

const getPointLegendGroup = () => screen.getByText('2PT').closest('.buttonGroup');

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('StatButtons', () => {
  it('starts stat hover preview after a half-second hover and clears it on leave', () => {
    vi.useFakeTimers();
    const onStatHoverChange = vi.fn();
    renderStatButtons({ onStatHoverChange });

    fireEvent.mouseEnter(getPointLegendGroup());

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(onStatHoverChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onStatHoverChange).toHaveBeenCalledWith(0);

    fireEvent.mouseLeave(getPointLegendGroup());

    expect(onStatHoverChange).toHaveBeenLastCalledWith(null);
  });

  it('cancels stat hover preview when hover ends before the delay', () => {
    vi.useFakeTimers();
    const onStatHoverChange = vi.fn();
    renderStatButtons({ onStatHoverChange });

    fireEvent.mouseEnter(getPointLegendGroup());
    fireEvent.mouseLeave(getPointLegendGroup());

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onStatHoverChange).not.toHaveBeenCalled();
  });

  it('does not preview stats that are currently toggled off', () => {
    vi.useFakeTimers();
    const onStatHoverChange = vi.fn();
    renderStatButtons({
      statOn: [false, true, true, true, true, true, true, true],
      onStatHoverChange,
    });

    fireEvent.mouseEnter(getPointLegendGroup());

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onStatHoverChange).not.toHaveBeenCalled();
  });
});
