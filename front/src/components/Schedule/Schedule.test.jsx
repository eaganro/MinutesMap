import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Schedule from './Schedule';

const mocks = vi.hoisted(() => ({
  useDateInputStateMock: vi.fn(),
  useHorizontalDragScrollMock: vi.fn(),
  trackDateFeatureUseMock: vi.fn(),
  handleDateChangeMock: vi.fn(),
  shiftDateMock: vi.fn(),
  didDragMock: vi.fn(),
  scrollByMock: vi.fn(),
  resetScrollPositionMock: vi.fn(),
}));

vi.mock('../hooks/useDateInputState', () => ({
  useDateInputState: mocks.useDateInputStateMock,
}));

vi.mock('../hooks/useHorizontalDragScroll', () => ({
  useHorizontalDragScroll: mocks.useHorizontalDragScrollMock,
}));

vi.mock('../hooks/useTrackFeatureUseOnce', () => ({
  useTrackFeatureUseOnce: () => mocks.trackDateFeatureUseMock,
}));

const buildProps = (overrides = {}) => ({
  games: [
    {
      id: '2026-02-03-phi-gsw',
      status: 'Q2 09:11',
      awayteam: 'PHI',
      hometeam: 'GSW',
      awayscore: 54,
      homescore: 49,
    },
  ],
  date: '2026-02-03',
  changeDate: vi.fn(),
  changeGame: vi.fn(),
  isLoading: false,
  selectedGameId: '2026-02-03-phi-gsw',
  ...overrides,
});

const makeDragHandlers = () => ({
  onMouseDown: vi.fn(),
  onMouseLeave: vi.fn(),
  onMouseUp: vi.fn(),
  onMouseMove: vi.fn(),
  onTouchStart: vi.fn(),
  onTouchEnd: vi.fn(),
  onTouchCancel: vi.fn(),
  onTouchMove: vi.fn(),
});

describe('Schedule', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useDateInputStateMock.mockReturnValue({
      handleDateChange: mocks.handleDateChangeMock,
      shiftDate: mocks.shiftDateMock,
    });
    mocks.didDragMock.mockReturnValue(false);
    mocks.useHorizontalDragScrollMock.mockReturnValue({
      scrollRef: { current: null },
      dragHandlers: makeDragHandlers(),
      didDrag: mocks.didDragMock,
      scrollBy: mocks.scrollByMock,
      resetScrollPosition: mocks.resetScrollPositionMock,
    });
  });

  it('uses value-based date changes and date navigation controls', () => {
    render(<Schedule {...buildProps()} />);

    fireEvent.change(screen.getByLabelText('Select game date'), {
      target: { value: '2026-02-04' },
    });
    expect(mocks.handleDateChangeMock).toHaveBeenCalledWith('2026-02-04');

    fireEvent.click(screen.getByLabelText('Previous date'));
    fireEvent.click(screen.getByLabelText('Next date'));

    expect(mocks.shiftDateMock).toHaveBeenNthCalledWith(1, -0);
    expect(mocks.shiftDateMock).toHaveBeenNthCalledWith(2, 2);
    expect(mocks.resetScrollPositionMock).toHaveBeenCalledTimes(2);
  });

  it('suppresses game selection click when the drag hook reports dragging', () => {
    mocks.didDragMock.mockReturnValue(true);
    const changeGame = vi.fn();
    render(<Schedule {...buildProps({ changeGame })} />);

    fireEvent.click(screen.getAllByText('PHI - GSW')[0]);

    expect(changeGame).not.toHaveBeenCalled();
  });

  it('supports game selection and horizontal scroll controls when not dragging', () => {
    const changeGame = vi.fn();
    render(<Schedule {...buildProps({ changeGame })} />);

    fireEvent.click(screen.getAllByText('PHI - GSW')[0]);
    fireEvent.click(screen.getByLabelText('Scroll games left'));
    fireEvent.click(screen.getByLabelText('Scroll games right'));

    expect(changeGame).toHaveBeenCalledWith('2026-02-03-phi-gsw');
    expect(mocks.scrollByMock).toHaveBeenNthCalledWith(1, -100);
    expect(mocks.scrollByMock).toHaveBeenNthCalledWith(2, 100);
  });
});
