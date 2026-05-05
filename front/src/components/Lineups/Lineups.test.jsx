import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Lineups from './Lineups';

vi.mock('../hooks/ui/useTheme', () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

vi.mock('../hooks/analytics/useTrackFeatureUseOnce', () => ({
  useTrackFeatureUseOnce: () => vi.fn(),
}));

const buildLineups = (prefix) =>
  Array.from({ length: 6 }, (_, index) => ({
    key: `${prefix}-${index + 1}`,
    players: [
      `${prefix} Player ${index + 1}A`,
      `${prefix} Player ${index + 1}B`,
      `${prefix} Player ${index + 1}C`,
      `${prefix} Player ${index + 1}D`,
      `${prefix} Player ${index + 1}E`,
    ],
    seconds: 300 - index,
    plusMinus: index,
  }));

describe('Lineups', () => {
  afterEach(() => {
    cleanup();
  });

  it('resets expanded lineup tables when the selected game changes', () => {
    const lineups = buildLineups('Away');
    const { rerender } = render(
      <Lineups
        gameId="game-1"
        awayTeam={{ name: 'Away Team', abr: 'AWY' }}
        homeTeam={{ name: 'Home Team', abr: 'HME' }}
        awayLineups={lineups}
        homeLineups={buildLineups('Home')}
        isLoading={false}
        statusMessage={null}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Show all (6)' })[0]);
    expect(screen.getAllByRole('button', { name: 'Show top lineups' })).toHaveLength(2);

    rerender(
      <Lineups
        gameId="game-2"
        awayTeam={{ name: 'Away Team', abr: 'AWY' }}
        homeTeam={{ name: 'Home Team', abr: 'HME' }}
        awayLineups={lineups}
        homeLineups={buildLineups('Home')}
        isLoading={false}
        statusMessage={null}
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Show all (6)' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Show top lineups' })).not.toBeInTheDocument();
  });
});
