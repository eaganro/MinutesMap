import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Boxscore from './Boxscore';

vi.mock('./processTeamStats', () => ({
  default: vi.fn((team, isHome, showMore, setShowMore, tableWrapperRef, onScroll) => (
    <div>
      <button type="button" onClick={() => setShowMore(!showMore)}>
        {showMore ? 'Show fewer stats' : 'Show more stats'}
      </button>
      <div
        data-testid={isHome ? 'home-box' : 'away-box'}
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
  useTrackFeatureUseOnce: () => vi.fn(),
}));

const buildBox = () => ({
  teams: {
    away: { abbr: 'PHI' },
    home: { abbr: 'GSW' },
  },
});

describe('Boxscore', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
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

  it('resets expanded stats and table scroll when the selected game changes', () => {
    const { rerender } = render(
      <Boxscore gameId="game-1" box={buildBox()} isLoading={false} statusMessage={null} />,
    );

    fireEvent.click(screen.getAllByText('Show more stats')[0]);
    expect(screen.getAllByText('Show fewer stats')).toHaveLength(2);

    const awayBox = screen.getByTestId('away-box');
    const homeBox = screen.getByTestId('home-box');
    awayBox.scrollLeft = 120;
    homeBox.scrollLeft = 120;

    rerender(<Boxscore gameId="game-2" box={buildBox()} isLoading={false} statusMessage={null} />);

    expect(screen.getAllByText('Show more stats')).toHaveLength(2);
    expect(screen.queryByText('Show fewer stats')).not.toBeInTheDocument();
    expect(screen.getByTestId('away-box').scrollLeft).toBe(0);
    expect(screen.getByTestId('home-box').scrollLeft).toBe(0);
  });
});
