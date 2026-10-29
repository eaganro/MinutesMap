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

    fireEvent.click(screen.getByRole('button', { name: /PHI 54, GSW 49/ }), { detail: 1 });

    expect(changeGame).not.toHaveBeenCalled();
  });

  it('exposes selected games as native buttons and allows keyboard-generated activation', () => {
    mocks.didDragMock.mockReturnValue(true);
    const changeGame = vi.fn();
    const { container } = render(<Schedule {...buildProps({ changeGame })} />);
    const gameButton = screen.getByRole('button', { name: /PHI 54, GSW 49/ });

    expect(gameButton.tagName).toBe('BUTTON');
    expect(gameButton).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelectorAll('.game img[alt=""][aria-hidden="true"]')).toHaveLength(2);

    gameButton.focus();
    fireEvent.click(gameButton, { detail: 0 });

    expect(gameButton).toHaveFocus();
    expect(changeGame).toHaveBeenCalledWith('2026-02-03-phi-gsw');
  });

  it('supports game selection and horizontal scroll controls when not dragging', () => {
    const changeGame = vi.fn();
    render(<Schedule {...buildProps({ changeGame })} />);

    fireEvent.click(screen.getByRole('button', { name: /PHI 54, GSW 49/ }));
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

    expect(screen.getByRole('region', { name: 'Game schedule' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading games...');
    expect(screen.queryByText('No Games Scheduled')).not.toBeInTheDocument();

    rerender(<Schedule {...buildProps({ games: [], status: 'success', isPending: false })} />);

    expect(screen.getByText('No Games Scheduled')).toBeInTheDocument();
  });

  describe('team picker', () => {
    it('opens from the Teams button, picks a team and closes', () => {
      const onSelectTeam = vi.fn();
      render(<Schedule {...buildProps({ onSelectTeam })} />);
      const trigger = screen.getByRole('button', { name: /^Teams/ });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      const panel = screen.getByRole('dialog', { name: 'Choose a team' });
      expect(panel.querySelectorAll('.teamPickerTeam')).toHaveLength(30);
      expect(screen.getByRole('button', { name: 'Atlanta Hawks' })).toHaveFocus();

      fireEvent.click(screen.getByRole('button', { name: 'San Antonio Spurs' }));
      expect(onSelectTeam).toHaveBeenCalledWith('SAS', { source: 'team-picker' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes on Escape and on a press outside, returning focus on Escape', () => {
      render(<Schedule {...buildProps({ onSelectTeam: vi.fn() })} />);
      const trigger = screen.getByRole('button', { name: /^Teams/ });

      fireEvent.click(trigger);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();

      fireEvent.click(trigger);
      fireEvent.pointerDown(document.body);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('is not offered without a way to select a team', () => {
      render(<Schedule {...buildProps()} />);
      expect(screen.queryByRole('button', { name: /^Teams/ })).not.toBeInTheDocument();
    });
  });

  describe('team mode', () => {
    const buildTeamMode = (overrides = {}) => ({
      team: 'BOS',
      season: '2026-27',
      games: [
        {
          id: '2026-10-20-bos-det',
          date: '2026-10-20',
          status: 'Final',
          opponent: 'DET',
          isHome: false,
          teamScore: 113,
          oppScore: 121,
          result: 'L',
        },
        {
          id: '2026-10-23-nyk-bos',
          date: '2026-10-23',
          status: 'Q3 05:12',
          opponent: 'NYK',
          isHome: true,
          teamScore: 74,
          oppScore: 70,
          result: null,
        },
        {
          id: '2026-10-26-chi-bos',
          date: '2026-10-26',
          status: '7:30 pm ET',
          opponent: 'CHI',
          isHome: true,
          teamScore: null,
          oppScore: null,
          result: null,
        },
      ],
      status: 'success',
      error: null,
      retry: vi.fn(),
      record: { wins: 0, losses: 1, seasonType: 'regular' },
      changeGame: vi.fn(),
      ...overrides,
    });

    it('replaces the date controls with a team chip and team game cards', () => {
      const teamMode = buildTeamMode();
      const onSelectTeam = vi.fn();
      const changeGame = vi.fn();
      render(
        <Schedule
          {...buildProps({
            teamMode,
            onSelectTeam,
            changeGame,
            selectedGameId: '2026-10-23-nyk-bos',
          })}
        />,
      );

      expect(screen.queryByLabelText('Select game date')).not.toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'BOS schedule' })).toBeInTheDocument();
      expect(screen.getByText('0-1 · 2026-27')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Oct 20, at DET, L 113-121' }));
      expect(teamMode.changeGame).toHaveBeenCalledWith('2026-10-20-bos-det');
      expect(changeGame).not.toHaveBeenCalled();

      expect(
        screen.getByRole('button', { name: 'Oct 23, vs NYK, 74-70, Q3 05:12' }),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('Live game')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Oct 26, vs CHI, 7:30/ })).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Show all games'));
      expect(onSelectTeam).toHaveBeenCalledWith(null);
    });

    it('labels a preseason record and omits a missing one', () => {
      const { rerender } = render(
        <Schedule
          {...buildProps({
            teamMode: buildTeamMode({ record: { wins: 4, losses: 0, seasonType: 'preseason' } }),
          })}
        />,
      );
      expect(screen.getByText('4-0 preseason · 2026-27')).toBeInTheDocument();

      rerender(<Schedule {...buildProps({ teamMode: buildTeamMode({ record: null }) })} />);
      expect(screen.getByText('2026-27')).toBeInTheDocument();
    });

    it('lets the team chip switch to another team from the picker', () => {
      const onSelectTeam = vi.fn();
      render(<Schedule {...buildProps({ teamMode: buildTeamMode(), onSelectTeam })} />);

      fireEvent.click(screen.getByRole('button', { name: 'Change team, now BOS' }));
      expect(screen.getByRole('button', { name: 'Boston Celtics' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      fireEvent.click(screen.getByRole('button', { name: 'Los Angeles Lakers' }));
      expect(onSelectTeam).toHaveBeenCalledWith('LAL', { source: 'team-picker' });
    });

    it('shows a retryable error when the team season fails to load', () => {
      const teamMode = buildTeamMode({
        games: [],
        status: 'error',
        error: { message: 'Check your connection and try again.' },
      });
      render(<Schedule {...buildProps({ teamMode, onSelectTeam: vi.fn() })} />);

      expect(screen.getByRole('alert')).toHaveTextContent('Check your connection');
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(teamMode.retry).toHaveBeenCalledTimes(1);
    });
  });
});
