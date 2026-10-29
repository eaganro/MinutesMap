import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Lineups from './Lineups';
import { TIP_SHOW_DELAY_MS } from '../tips/useTipSequence';

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

const showTips = () => {
  act(() => {
    vi.advanceTimersByTime(TIP_SHOW_DELAY_MS);
  });
};

describe('Lineups', () => {
  beforeEach(() => {
    localStorage.clear();
  });

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

  describe('tips', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('explains lineup rows, then filtering, until a player is picked', () => {
      renderLineups();
      expect(screen.queryByRole('note')).not.toBeInTheDocument();

      showTips();
      expect(screen.getByText(/Each row is a group of five/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
      expect(screen.getByText(/a player to see only the lineups they were in/)).toBeInTheDocument();

      fireEvent.click(screen.getAllByRole('button', { name: 'Away Player 1A' })[1]);
      expect(screen.queryByRole('note')).not.toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem('lineupTips'))).toEqual({
        rows: true,
        filter: true,
      });
    });
  });

  describe('stacked layout', () => {
    beforeEach(() => {
      localStorage.clear();
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
          matches: true,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('only shows tips once the section has been opened', () => {
      vi.useFakeTimers();
      try {
        renderLineups();
        showTips();
        expect(screen.queryByRole('note')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Lineups/ }));
        showTips();
        expect(screen.getByText(/Each row is a group of five/)).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('starts collapsed and remembers when it is opened', () => {
      renderLineups();

      const disclosure = screen.getByRole('button', { name: /Lineups/ });
      expect(disclosure).toHaveAttribute('aria-expanded', 'false');
      expect(disclosure).toHaveTextContent('6 AWY · 6 HME');
      expect(screen.queryByText('6 lineups')).not.toBeInTheDocument();

      fireEvent.click(disclosure);

      expect(disclosure).toHaveAttribute('aria-expanded', 'true');
      expect(localStorage.getItem('lineupsOpen')).toBe('true');
    });

    it('shows one team at a time with filters behind a toggle', () => {
      localStorage.setItem('lineupsOpen', 'true');
      renderLineups();

      expect(screen.getAllByRole('button', { name: 'Away Player 1A' })).toHaveLength(1);
      expect(screen.queryByRole('button', { name: 'Home Player 1A' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Highlight' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Filter players' }));
      expect(screen.getByRole('button', { name: 'Highlight' })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Away Player 1A' })).toHaveLength(2);

      fireEvent.click(screen.getByRole('button', { name: 'Home Team' }));
      expect(screen.getByRole('button', { name: 'Home Team' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.queryByRole('button', { name: 'Away Player 1A' })).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Home Player 1A' }).length).toBeGreaterThan(0);
    });
  });
});
