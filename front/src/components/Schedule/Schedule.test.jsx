import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    const days = within(screen.getByRole('group', { name: 'Day' }));

    // The picked day sits in the middle of five.
    expect(days.getAllByRole('button').map((day) => day.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/^Sun, Feb 1/),
      expect.stringMatching(/^Mon, Feb 2/),
      expect.stringMatching(/^Tue, Feb 3/),
      expect.stringMatching(/^Wed, Feb 4/),
      expect.stringMatching(/^Thu, Feb 5/),
    ]);
    expect(days.getByRole('button', { name: /^Tue, Feb 3/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: /^Select game date/ }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /^Fri, Feb 6/ }),
    );
    expect(mocks.handleDateChangeMock).toHaveBeenCalledWith('2026-02-06');
    expect(screen.queryByRole('dialog', { name: 'Choose a date' })).not.toBeInTheDocument();

    fireEvent.click(days.getByRole('button', { name: /^Mon, Feb 2/ }));
    fireEvent.click(days.getByRole('button', { name: /^Thu, Feb 5/ }));
    fireEvent.click(days.getByRole('button', { name: /^Tue, Feb 3/ }));

    expect(mocks.shiftDateMock).toHaveBeenNthCalledWith(1, -1);
    expect(mocks.shiftDateMock).toHaveBeenNthCalledWith(2, 2);
    // The picked day itself does nothing.
    expect(mocks.shiftDateMock).toHaveBeenCalledTimes(2);
    // Scrolling back to the start waits for the new date's games.
    expect(mocks.resetScrollPositionMock).not.toHaveBeenCalled();
  });

  describe('date picker', () => {
    it('browses months without changing the date until a day is picked', () => {
      render(<Schedule {...buildProps()} />);
      const trigger = screen.getByRole('button', { name: /^Select game date/ });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('February 2026')).toBeInTheDocument();
      const calendar = () => within(screen.getByRole('dialog'));
      expect(calendar().getByRole('button', { name: /^Tue, Feb 3/ })).toHaveFocus();

      fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
      fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
      expect(screen.getByText('December 2025')).toBeInTheDocument();
      expect(mocks.handleDateChangeMock).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Choose a date' })).toBeInTheDocument();

      fireEvent.click(calendar().getByRole('button', { name: /^Thu, Dec 25/ }));
      expect(mocks.handleDateChangeMock).toHaveBeenCalledWith('2025-12-25');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes without a change on Escape, a press outside, or the current day', () => {
      render(<Schedule {...buildProps()} />);
      const trigger = screen.getByRole('button', { name: /^Select game date/ });

      fireEvent.click(trigger);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();

      fireEvent.click(trigger);
      fireEvent.pointerDown(document.body);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      fireEvent.click(trigger);
      fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: /^Tue, Feb 3/ }),
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mocks.handleDateChangeMock).not.toHaveBeenCalled();
    });
  });

  describe('keeping the picked game in view', () => {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    const dayOfGames = ['phi-gsw', 'nyk-bos', 'mia-chi', 'lal-den', 'sas-dal'].map((teams, i) => ({
      id: `2026-02-03-${teams}`,
      status: 'Final',
      awayteam: teams.slice(0, 3).toUpperCase(),
      hometeam: teams.slice(4).toUpperCase(),
      awayscore: 100 + i,
      homescore: 90 + i,
    }));

    // A 360px strip of 96px cards, 6px apart: the fourth card runs past the edge.
    const layOutStrip = () => {
      HTMLElement.prototype.getBoundingClientRect = function getRect() {
        if (this.classList?.contains('games')) {
          return { left: 0, right: 360, width: 360, top: 0, bottom: 56, height: 56 };
        }
        if (this.dataset?.gameId) {
          const left = [...this.parentElement.children].indexOf(this) * 102;
          return { left, right: left + 96, width: 96, top: 0, bottom: 50, height: 50 };
        }
        return originalRect.call(this);
      };
      const scrollTo = vi.fn();
      HTMLElement.prototype.scrollTo = scrollTo;
      return scrollTo;
    };

    afterEach(() => {
      HTMLElement.prototype.getBoundingClientRect = originalRect;
      HTMLElement.prototype.scrollTo = originalScrollTo;
    });

    it("scrolls a day's games to a linked game that would start off screen", () => {
      const scrollTo = layOutStrip();
      render(
        <Schedule {...buildProps({ games: dayOfGames, selectedGameId: '2026-02-03-lal-den' })} />,
      );

      // Centred: the card's left (306) less half the strip's spare room ((360 - 96) / 2).
      expect(scrollTo).toHaveBeenCalledWith({ left: 174, behavior: 'auto' });
    });

    it('leaves the day alone when the picked game is already on screen', () => {
      const scrollTo = layOutStrip();
      render(
        <Schedule {...buildProps({ games: dayOfGames, selectedGameId: '2026-02-03-nyk-bos' })} />,
      );

      expect(scrollTo).not.toHaveBeenCalled();
    });
  });

  it('suppresses game selection click when the drag hook reports dragging', () => {
    mocks.didDragMock.mockReturnValue(true);
    const changeGame = vi.fn();
    render(<Schedule {...buildProps({ changeGame })} />);

    fireEvent.click(screen.getByRole('link', { name: /PHI 54, GSW 49/ }), { detail: 1 });

    expect(changeGame).not.toHaveBeenCalled();
  });

  it('exposes games as links to their pages and allows keyboard-generated activation', () => {
    mocks.didDragMock.mockReturnValue(true);
    const changeGame = vi.fn();
    const { container } = render(<Schedule {...buildProps({ changeGame })} />);
    const gameButton = screen.getByRole('link', { name: /PHI 54, GSW 49/ });

    expect(gameButton).toHaveAttribute('href', '/2026-02-03-phi-gsw');
    expect(gameButton).toHaveAttribute('aria-current', 'page');
    expect(container.querySelectorAll('.game img[alt=""][aria-hidden="true"]')).toHaveLength(2);

    gameButton.focus();
    fireEvent.click(gameButton, { detail: 0 });

    expect(gameButton).toHaveFocus();
    expect(changeGame).toHaveBeenCalledWith('2026-02-03-phi-gsw');
  });

  it('selects a game in place on a plain click and leaves modified clicks to the browser', () => {
    const changeGame = vi.fn();
    render(<Schedule {...buildProps({ changeGame })} />);
    const game = screen.getByRole('link', { name: /PHI 54, GSW 49/ });
    // Records whether the browser would follow the link, then stops jsdom from trying.
    const followed = [];
    const stopNavigation = (event) => {
      followed.push(!event.defaultPrevented);
      event.preventDefault();
    };
    window.addEventListener('click', stopNavigation);

    fireEvent.click(game, { ctrlKey: true });
    fireEvent.click(game, { metaKey: true });
    expect(changeGame).not.toHaveBeenCalled();
    fireEvent.click(game);
    window.removeEventListener('click', stopNavigation);

    expect(followed).toEqual([true, true, false]);
    expect(changeGame).toHaveBeenCalledWith('2026-02-03-phi-gsw');
  });

  it('supports game selection and horizontal scroll controls when not dragging', () => {
    const changeGame = vi.fn();
    render(<Schedule {...buildProps({ changeGame })} />);

    fireEvent.click(screen.getByRole('link', { name: /PHI 54, GSW 49/ }));
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

  it('labels games whose teams are not set yet as TBD', () => {
    render(
      <Schedule
        {...buildProps({
          games: [
            {
              id: '0062600001',
              status: '8:30 pm ET',
              awayteam: '',
              hometeam: null,
              awayscore: 0,
              homescore: 0,
            },
          ],
        })}
      />,
    );

    const card = screen.getByRole('link', { name: /^TBD at TBD/ });
    expect([...card.querySelectorAll('.cardAbbr')].map((abbr) => abbr.textContent)).toEqual([
      'TBD',
      'TBD',
    ]);
    // No score before the game, just its start time (every game is ET, so the card drops it).
    expect(card.querySelectorAll('.cardScore')).toHaveLength(0);
    expect(card).toHaveClass('isScoreless');
    expect(card.querySelector('.statusText')).toHaveTextContent(/^8:30 pm$/);
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

  describe('list switch blur', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    const nextDateGames = [
      {
        id: '2026-02-04-phi-nyk',
        status: 'Final',
        awayteam: 'PHI',
        hometeam: 'NYK',
        awayscore: 118,
        homescore: 110,
      },
    ];

    it('keeps the previous date’s games blurred until the new date loads', () => {
      vi.useFakeTimers();
      const changeGame = vi.fn();
      const { container, rerender } = render(<Schedule {...buildProps({ changeGame })} />);

      rerender(
        <Schedule
          {...buildProps({
            changeGame,
            date: '2026-02-04',
            games: [],
            status: 'loading',
            isPending: true,
          })}
        />,
      );
      expect(container.querySelector('.games')).toHaveClass('isLoading');
      expect(screen.queryByText('Updating games…')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('link', { name: /PHI 54, GSW 49/ }), { detail: 1 });
      expect(changeGame).not.toHaveBeenCalled();

      act(() => vi.advanceTimersByTime(500));
      expect(screen.getByText('Updating games…')).toBeInTheDocument();
      expect(mocks.resetScrollPositionMock).not.toHaveBeenCalled();

      rerender(
        <Schedule
          {...buildProps({
            changeGame,
            date: '2026-02-04',
            games: nextDateGames,
            isPending: false,
          })}
        />,
      );
      act(() => vi.advanceTimersByTime(0));
      expect(container.querySelector('.games')).not.toHaveClass('isLoading');
      expect(screen.getByRole('link', { name: /PHI 118, NYK 110/ })).toBeInTheDocument();
      expect(mocks.resetScrollPositionMock).toHaveBeenCalledTimes(1);
    });

    it('holds a shorter minimum blur when the new date loads quickly', () => {
      vi.useFakeTimers();
      const { container, rerender } = render(<Schedule {...buildProps()} />);

      rerender(<Schedule {...buildProps({ games: [], status: 'loading', isPending: true })} />);
      rerender(<Schedule {...buildProps({ games: nextDateGames, isPending: false })} />);
      expect(container.querySelector('.games')).toHaveClass('isLoading');
      expect(screen.getByRole('link', { name: /PHI 54, GSW 49/ })).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(149));
      expect(container.querySelector('.games')).toHaveClass('isLoading');

      act(() => vi.advanceTimersByTime(1));
      expect(container.querySelector('.games')).not.toHaveClass('isLoading');
      expect(screen.getByRole('link', { name: /PHI 118, NYK 110/ })).toBeInTheDocument();
    });

    it('does not blur or flag live refreshes of the same date', () => {
      vi.useFakeTimers();
      const { container, rerender } = render(<Schedule {...buildProps()} />);

      rerender(<Schedule {...buildProps({ isPending: true })} />);
      act(() => vi.advanceTimersByTime(1000));

      expect(container.querySelector('.games')).not.toHaveClass('isLoading');
      expect(screen.queryByText('Updating games…')).not.toBeInTheDocument();
    });

    const phiTeamMode = () => ({
      team: 'PHI',
      season: '2026-27',
      games: [
        {
          id: '2026-10-21-phi-mil',
          date: '2026-10-21',
          status: 'Final',
          opponent: 'MIL',
          isHome: true,
          teamScore: 120,
          oppScore: 112,
          result: 'W',
        },
      ],
      status: 'success',
      error: null,
      retry: vi.fn(),
      record: { wins: 1, losses: 0, seasonType: 'regular' },
      changeGame: vi.fn(),
    });

    it('blurs from the date view into an already loaded team view', () => {
      vi.useFakeTimers();
      const { container, rerender } = render(<Schedule {...buildProps()} />);

      rerender(<Schedule {...buildProps({ teamMode: phiTeamMode() })} />);
      // The whole date view stays, blurred, until the swap.
      expect(container.querySelector('.scheduleContent')).toHaveClass('isSwitchingView');
      expect(container.querySelector('.games')).toHaveClass('isLoading');
      expect(screen.getByLabelText(/^Select game date/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /PHI 54, GSW 49/ })).toBeInTheDocument();
      expect(mocks.resetScrollPositionMock).not.toHaveBeenCalled();

      act(() => vi.advanceTimersByTime(300));
      expect(container.querySelector('.scheduleContent')).not.toHaveClass('isSwitchingView');
      expect(container.querySelector('.games')).not.toHaveClass('isLoading');
      expect(screen.getByRole('button', { name: 'Change team, now PHI' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /vs MIL/ })).toBeInTheDocument();
      expect(screen.getByText(/^1-0/)).toBeInTheDocument();
      expect(mocks.resetScrollPositionMock).toHaveBeenCalled();
    });

    it('blurs from the team view back into an already loaded date view', () => {
      vi.useFakeTimers();
      const { container, rerender } = render(
        <Schedule {...buildProps({ teamMode: phiTeamMode() })} />,
      );

      rerender(<Schedule {...buildProps()} />);
      expect(container.querySelector('.scheduleContent')).toHaveClass('isSwitchingView');
      expect(screen.getByRole('button', { name: 'Change team, now PHI' })).toBeInTheDocument();
      expect(screen.getByText(/^1-0/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /vs MIL/ })).toBeInTheDocument();

      // A view switch keeps the longer minimum, even into the date view.
      act(() => vi.advanceTimersByTime(150));
      expect(container.querySelector('.scheduleContent')).toHaveClass('isSwitchingView');

      act(() => vi.advanceTimersByTime(150));
      expect(container.querySelector('.scheduleContent')).not.toHaveClass('isSwitchingView');
      expect(container.querySelector('.games')).not.toHaveClass('isLoading');
      expect(screen.getByLabelText(/^Select game date/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /PHI 54, GSW 49/ })).toBeInTheDocument();
      expect(mocks.resetScrollPositionMock).toHaveBeenCalled();
    });

    it('keeps the previous team’s games blurred while a new team loads', () => {
      const phiMode = phiTeamMode();
      const { container, rerender } = render(<Schedule {...buildProps({ teamMode: phiMode })} />);
      expect(screen.getByText(/^1-0/)).toBeInTheDocument();

      rerender(
        <Schedule
          {...buildProps({
            teamMode: { ...phiMode, team: 'NYK', games: [], status: 'loading', record: null },
          })}
        />,
      );

      expect(screen.getByRole('button', { name: 'Change team, now NYK' })).toBeInTheDocument();
      expect(container.querySelector('.scheduleContent')).not.toHaveClass('isSwitchingView');
      expect(screen.queryByText(/^1-0/)).not.toBeInTheDocument();
      expect(container.querySelector('.games')).toHaveClass('isLoading');
      fireEvent.click(screen.getByRole('link', { name: /vs MIL/ }), { detail: 1 });
      expect(phiMode.changeGame).not.toHaveBeenCalled();
    });
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

      expect(screen.queryByLabelText(/^Select game date/)).not.toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'BOS schedule' })).toBeInTheDocument();
      expect(screen.getByText('0-1 · 2026-27')).toBeInTheDocument();

      const detroitGame = screen.getByRole('link', { name: 'Tue, Oct 20, at DET, L 113-121' });
      expect(detroitGame).toHaveAttribute('href', '/2026-10-20-bos-det?team=BOS');
      fireEvent.click(detroitGame);
      expect(teamMode.changeGame).toHaveBeenCalledWith('2026-10-20-bos-det');
      expect(changeGame).not.toHaveBeenCalled();

      expect(
        screen.getByRole('link', { name: 'Fri, Oct 23, vs NYK, 74-70, Q3 05:12' }),
      ).toHaveAttribute('aria-current', 'page');
      expect(screen.getByLabelText('Live game')).toBeInTheDocument();
      expect(
        screen
          .getByRole('link', { name: 'Mon, Oct 26, vs CHI, 7:30 pm ET' })
          .querySelector('.statusText'),
      ).toHaveTextContent(/^7:30 pm$/);

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
