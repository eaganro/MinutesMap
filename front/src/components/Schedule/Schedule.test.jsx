import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../hooks/schedule/useDateInputState', () => ({
  useDateInputState: mocks.useDateInputStateMock,
}));

vi.mock('../hooks/ui/useHorizontalDragScroll', () => ({
  useHorizontalDragScroll: mocks.useHorizontalDragScrollMock,
}));

vi.mock('../hooks/analytics/useTrackFeatureUseOnce', () => ({
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
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return 100;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        return 200;
      },
    });
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

    expect(mocks.shiftDateMock).toHaveBeenNthCalledWith(1, -1);
    expect(mocks.shiftDateMock).toHaveBeenNthCalledWith(2, 1);
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

  it('hides game scroll controls without removing their layout space when games fit', async () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return 200;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        return 100;
      },
    });

    const { container } = render(<Schedule {...buildProps()} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Scroll games left')).toBeDisabled();
      expect(screen.getByLabelText('Scroll games right')).toBeDisabled();
    });

    const gameScrollButtons = container.querySelectorAll('.gamePick .scheduleButton');
    expect(gameScrollButtons).toHaveLength(2);
    expect(gameScrollButtons[0]).toHaveClass('isHidden');
    expect(gameScrollButtons[1]).toHaveClass('isHidden');
  });

  it('does not show the live indicator for TBD games', () => {
    render(
      <Schedule
        {...buildProps({
          games: [
            {
              id: '2026-02-03-phi-gsw',
              status: 'TBD',
              awayteam: 'PHI',
              hometeam: 'GSW',
              awayscore: 0,
              homescore: 0,
            },
          ],
        })}
      />,
    );

    expect(screen.queryByLabelText('Live game')).not.toBeInTheDocument();
  });

  it('shows schedule errors with a retry action instead of an empty-schedule message', () => {
    const onRetry = vi.fn();
    render(
      <Schedule
        {...buildProps({
          games: [],
          status: 'error',
          error: { message: 'Check your connection and try again.' },
          onRetry,
        })}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load games');
    expect(screen.queryByText('No Games Scheduled')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('only shows No Games Scheduled after a successful empty response', () => {
    const { rerender } = render(
      <Schedule {...buildProps({ games: [], status: 'loading', isPending: true })} />,
    );

    expect(screen.queryByText('No Games Scheduled')).not.toBeInTheDocument();

    rerender(<Schedule {...buildProps({ games: [], status: 'success', isPending: false })} />);

    expect(screen.getByText('No Games Scheduled')).toBeInTheDocument();
  });
});
