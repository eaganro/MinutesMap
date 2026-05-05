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

const renderLineups = () =>
  render(
    <Lineups
      gameId="game-1"
      awayTeam={{ name: 'Away Team', abr: 'AWY' }}
      homeTeam={{ name: 'Home Team', abr: 'HME' }}
      awayLineups={buildLineups('Away')}
      homeLineups={buildLineups('Home')}
      isLoading={false}
      statusMessage={null}
    />,
  );

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

  it('lets lineup row player pills apply the active filter mode', () => {
    renderLineups();

    const playerButtons = screen.getAllByRole('button', { name: 'Away Player 1A' });
    fireEvent.click(playerButtons[1]);

    expect(screen.getByText('Selected total')).toBeInTheDocument();
    expect(playerButtons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(playerButtons[1]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button', { name: 'Show all (6)' })).toHaveLength(1);
  });

  it('lets selected total player pills remove the active selection', () => {
    renderLineups();

    fireEvent.click(screen.getAllByRole('button', { name: 'Away Player 1A' })[1]);
    expect(screen.getByText('Selected total')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Away Player 1A' })[1]);

    expect(screen.queryByText('Selected total')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Away Player 1A' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Show all (6)' })).toHaveLength(2);
  });

  it('lets lineup row player pills apply the active highlight mode', () => {
    renderLineups();

    fireEvent.click(screen.getAllByRole('button', { name: 'Highlight' })[0]);
    const playerButtons = screen.getAllByRole('button', { name: 'Away Player 1A' });
    fireEvent.click(playerButtons[1]);

    expect(screen.queryByText('Selected total')).not.toBeInTheDocument();
    expect(playerButtons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(playerButtons[1]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button', { name: 'Show all (6)' })).toHaveLength(2);
  });
});
