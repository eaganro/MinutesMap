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

  it('isolates a stat after a half-second press and hold', () => {
    vi.useFakeTimers();
    const changeStatOn = vi.fn();
    renderStatButtons({ changeStatOn });
    const pointLegendGroup = getPointLegendGroup();

    fireEvent.pointerDown(pointLegendGroup, { button: 0 });

    expect(pointLegendGroup).toHaveClass('isHoldCharging');

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(changeStatOn).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(changeStatOn.mock.calls.map(([index]) => index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pointLegendGroup).not.toHaveClass('isHoldCharging');

    fireEvent.pointerUp(pointLegendGroup);
    fireEvent.click(pointLegendGroup);

    expect(changeStatOn).toHaveBeenCalledTimes(7);
  });

  it('suppresses hover preview while press-and-hold progress is filling', () => {
    vi.useFakeTimers();
    const changeStatOn = vi.fn();
    const onStatHoverChange = vi.fn();
    renderStatButtons({ changeStatOn, onStatHoverChange });
    const pointLegendGroup = getPointLegendGroup();

    fireEvent.mouseEnter(pointLegendGroup);
    fireEvent.pointerDown(pointLegendGroup, { button: 0 });

    act(() => {
      vi.advanceTimersByTime(499);
    });

    expect(onStatHoverChange).not.toHaveBeenCalled();
    expect(changeStatOn).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(changeStatOn.mock.calls.map(([index]) => index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(onStatHoverChange).not.toHaveBeenCalled();
  });

  it('turns the held stat on when isolating a disabled stat', () => {
    vi.useFakeTimers();
    const changeStatOn = vi.fn();
    renderStatButtons({
      statOn: [false, true, false, true, false, false, false, false],
      changeStatOn,
    });

    fireEvent.pointerDown(getPointLegendGroup(), { button: 0 });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(changeStatOn.mock.calls.map(([index]) => index)).toEqual([0, 1, 3]);
  });

  it('turns all stats on when holding the only active stat', () => {
    vi.useFakeTimers();
    const changeStatOn = vi.fn();
    renderStatButtons({
      statOn: [true, false, false, false, false, false, false, false],
      changeStatOn,
    });

    fireEvent.pointerDown(getPointLegendGroup(), { button: 0 });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(changeStatOn.mock.calls.map(([index]) => index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('turns all stats on when holding any stat while none are active', () => {
    vi.useFakeTimers();
    const changeStatOn = vi.fn();
    renderStatButtons({
      statOn: [false, false, false, false, false, false, false, false],
      changeStatOn,
    });

    fireEvent.pointerDown(getPointLegendGroup(), { button: 0 });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(changeStatOn.mock.calls.map(([index]) => index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('cancels stat isolation when the hold ends before a half second', () => {
    vi.useFakeTimers();
    const changeStatOn = vi.fn();
    renderStatButtons({ changeStatOn });
    const pointLegendGroup = getPointLegendGroup();

    fireEvent.pointerDown(pointLegendGroup, { button: 0 });
    fireEvent.pointerUp(pointLegendGroup);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(changeStatOn).not.toHaveBeenCalled();
    expect(pointLegendGroup).not.toHaveClass('isHoldCharging');
  });
});
