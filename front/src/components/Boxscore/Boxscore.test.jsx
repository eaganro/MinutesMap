import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Boxscore from './Boxscore';

const mocks = vi.hoisted(() => ({
  trackBoxscoreFeatureUseMock: vi.fn(),
}));

vi.mock('./processTeamStats', () => ({
  default: vi.fn((team, showMore, tableWrapperRef, onScroll) => (
    <div>
      <div
        data-testid={team?.abbr === 'GSW' ? 'home-box' : 'away-box'}
        ref={tableWrapperRef}
        onScroll={onScroll}
      >
        {team?.abbr || 'N/A'}
      </div>
    </div>
  )),
}));

vi.mock('../hooks/ui/useTheme', () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

vi.mock('../hooks/analytics/useTrackFeatureUseOnce', () => ({
  useTrackFeatureUseOnce: () => mocks.trackBoxscoreFeatureUseMock,
}));

const buildPlayers = (count) => Array.from({ length: count }, (_, index) => ({ id: index }));

const buildBox = (playerCount = 8) => ({
  teams: {
    away: { abbr: 'PHI', players: buildPlayers(playerCount) },
    home: { abbr: 'GSW', players: buildPlayers(playerCount) },
  },
});

describe('Boxscore', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }),
    });
  });

  it('keeps stable team box content while loading refreshes', () => {
    const { rerender } = render(
      <Boxscore box={buildBox()} isLoading={false} statusMessage={null} />,
    );

    expect(screen.getByTestId('away-box')).toHaveTextContent('PHI');
    expect(screen.getByTestId('home-box')).toHaveTextContent('GSW');

    rerender(<Boxscore box={{}} isLoading={true} statusMessage={null} />);

    expect(screen.getByTestId('away-box')).toHaveTextContent('PHI');
    expect(screen.getByTestId('home-box')).toHaveTextContent('GSW');
  });

  it('shows status message when no box data exists', () => {
    render(<Boxscore box={{}} isLoading={false} statusMessage="Game has not started." />);

    expect(screen.getByText('Game has not started.')).toBeInTheDocument();
  });

  it('announces loading when no box score data exists', () => {
    render(<Boxscore box={{}} isLoading statusMessage={null} />);

    expect(screen.getByRole('region', { name: 'Box score' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Loading box score...');
  });

  it('persists expanded stats and resets table scroll when the selected game changes', () => {
    const { rerender } = render(
      <Boxscore gameId="game-1" box={buildBox()} isLoading={false} statusMessage={null} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show all players' }));
    expect(screen.getByRole('button', { name: 'Show fewer players' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(localStorage.getItem('boxscoreExpanded')).toBe('true');

    const awayBox = screen.getByTestId('away-box');
    const homeBox = screen.getByTestId('home-box');
    awayBox.scrollLeft = 120;
    homeBox.scrollLeft = 120;

    rerender(<Boxscore gameId="game-2" box={buildBox()} isLoading={false} statusMessage={null} />);

    expect(screen.getByRole('button', { name: 'Show fewer players' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show all players' })).not.toBeInTheDocument();
    expect(screen.getByTestId('away-box').scrollLeft).toBe(0);
    expect(screen.getByTestId('home-box').scrollLeft).toBe(0);
  });

  it('loads the expanded stats preference from localStorage', () => {
    localStorage.setItem('boxscoreExpanded', 'true');

    render(<Boxscore gameId="game-1" box={buildBox()} isLoading={false} statusMessage={null} />);

    expect(screen.getByRole('button', { name: 'Show fewer players' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show all players' })).not.toBeInTheDocument();
  });

  it('hides the expand button when no players are hidden', () => {
    render(<Boxscore gameId="game-1" box={buildBox(5)} isLoading={false} statusMessage={null} />);

    expect(screen.queryByRole('button', { name: 'Show all players' })).not.toBeInTheDocument();
  });

  it('tracks boxscore feature use from click, touch, and wheel interactions', () => {
    const { container } = render(
      <Boxscore gameId="game-1" box={buildBox()} isLoading={false} statusMessage={null} />,
    );
    const box = container.querySelector('.box');

    fireEvent.click(box);
    fireEvent.touchStart(box);
    fireEvent.wheel(box);

    expect(mocks.trackBoxscoreFeatureUseMock).toHaveBeenCalledTimes(3);
  });
});
