import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Boxscore from './Boxscore';

vi.mock('./processTeamStats', () => ({
  default: vi.fn((team, isHome) => (
    <div data-testid={isHome ? 'home-box' : 'away-box'}>{team?.abbr || 'N/A'}</div>
  )),
}));

vi.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

vi.mock('../hooks/useTrackFeatureUseOnce', () => ({
  useTrackFeatureUseOnce: () => vi.fn(),
}));

const buildBox = () => ({
  teams: {
    away: { abbr: 'PHI' },
    home: { abbr: 'GSW' },
  },
});

describe('Boxscore', () => {
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
});
