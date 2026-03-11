import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../hooks/ui/useTheme';
import Play from './Play';

const STAT_ON = [true, true, true, true, true, true, true, true];

const buildPlayData = () => ({
  awayTeamNames: { name: 'Philadelphia 76ers', abr: 'PHI' },
  homeTeamNames: { name: 'Golden State Warriors', abr: 'GSW' },
  playerActions: {
    away: {
      filtered: {
        'J. Embiid': [
          {
            period: 1,
            clock: 'PT11M00.00S',
            actionType: '2pt',
            description: 'J. Embiid makes driving layup',
            result: 'm',
            actionNumber: 11,
            scoreAway: 2,
            scoreHome: 0,
            side: 'away',
          },
          {
            period: 1,
            clock: 'PT10M20.00S',
            actionType: 'rebound',
            description: 'J. Embiid defensive rebound',
            actionNumber: 12,
            side: 'away',
          },
        ],
        'T. Maxey': [],
      },
      all: {
        'J. Embiid': [
          {
            period: 1,
            clock: 'PT11M00.00S',
            actionType: '2pt',
            description: 'J. Embiid makes driving layup',
            result: 'm',
            actionNumber: 11,
            scoreAway: 2,
            scoreHome: 0,
            side: 'away',
          },
          {
            period: 1,
            clock: 'PT10M20.00S',
            actionType: 'rebound',
            description: 'J. Embiid defensive rebound',
            actionNumber: 12,
            side: 'away',
          },
        ],
        'T. Maxey': [],
      },
    },
    home: {
      filtered: {
        'S. Curry': [
          {
            period: 1,
            clock: 'PT10M45.00S',
            actionType: '3pt',
            description: 'S. Curry misses 3PT jump shot',
            result: 'x',
            actionNumber: 21,
            scoreAway: 2,
            scoreHome: 0,
            side: 'home',
          },
        ],
      },
      all: {
        'S. Curry': [
          {
            period: 1,
            clock: 'PT10M45.00S',
            actionType: '3pt',
            description: 'S. Curry misses 3PT jump shot',
            result: 'x',
            actionNumber: 21,
            scoreAway: 2,
            scoreHome: 0,
            side: 'home',
          },
        ],
      },
    },
  },
  allActions: [
    {
      period: 1,
      clock: 'PT11M00.00S',
      actionType: '2pt',
      description: 'J. Embiid makes driving layup',
      result: 'm',
      actionNumber: 11,
      scoreAway: 2,
      scoreHome: 0,
      side: 'away',
    },
    {
      period: 1,
      clock: 'PT10M45.00S',
      actionType: '3pt',
      description: 'S. Curry misses 3PT jump shot',
      result: 'x',
      actionNumber: 21,
      scoreAway: 2,
      scoreHome: 0,
      side: 'home',
    },
    {
      period: 1,
      clock: 'PT10M20.00S',
      actionType: 'rebound',
      description: 'J. Embiid defensive rebound',
      actionNumber: 12,
      side: 'away',
    },
  ],
  scoreTimeline: [
    { period: 1, clock: 'PT12M00.00S', away: 0, home: 0 },
    { period: 1, clock: 'PT11M00.00S', away: 2, home: 0 },
  ],
  awayPlayerTimeline: {
    'J. Embiid': [{ period: 1, start: 'PT12M00.00S', end: 'PT00M00.00S' }],
    'T. Maxey': [{ period: 1, start: 'PT12M00.00S', end: 'PT00M00.00S' }],
  },
  homePlayerTimeline: {
    'S. Curry': [{ period: 1, start: 'PT12M00.00S', end: 'PT00M00.00S' }],
  },
  numQs: 1,
  lastAction: {
    period: 1,
    clock: 'PT10M20.00S',
    status: 'Q1 10:20',
  },
  gameDate: '2026-03-11',
  captions: null,
});

const buildBox = () => ({
  teams: {
    away: {
      players: [
        { first: 'Joel', last: 'Embiid' },
        { first: 'Tyrese', last: 'Maxey' },
      ],
    },
    home: {
      players: [{ first: 'Stephen', last: 'Curry' }],
    },
  },
});

const buildProps = (overrides = {}) => ({
  gameId: '2026-03-11-phi-gsw',
  nbaGameId: '0022500001',
  gameStatus: 'Q1 10:20',
  box: buildBox(),
  playData: buildPlayData(),
  sectionWidth: 360,
  isLoading: false,
  statusMessage: null,
  showScoreDiff: true,
  statOn: STAT_ON,
  ...overrides,
});

const renderPlay = (props) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  return render(
    <ThemeProvider>
      <Play {...props} />
    </ThemeProvider>,
  );
};

afterEach(() => {
  cleanup();
});

describe('Play', () => {
  it('opens a mobile player sheet from the player name and closes it', () => {
    renderPlay(buildProps());

    fireEvent.click(screen.getByRole('button', { name: /open player detail for j\. embiid/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-player-sheet')).toBeInTheDocument();
    expect(screen.getByLabelText('Legend')).toBeInTheDocument();
    const boxScore = screen.getByLabelText('Player box score');
    expect(boxScore).toBeInTheDocument();
    expect(
      within(boxScore)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual([
      'PLAYER',
      'MIN',
      'PTS',
      'REB',
      'AST',
      'FGM-A',
      'FG%',
      '3PM-A',
      '3P%',
      'FTM-A',
      'FT%',
      'OREB',
      'DREB',
      'STL',
      'BLK',
      'TO',
      'PF',
      '+/-',
    ]);
    expect(screen.getByRole('button', { name: 'Game' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Q1' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: /close joel embiid detail view/i }));

    expect(screen.queryByTestId('mobile-player-sheet')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Q1' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('reuses the player-view legend as stat toggles', () => {
    const changeStatOn = vi.fn();

    renderPlay(buildProps({ changeStatOn }));

    fireEvent.click(screen.getByRole('button', { name: /open player detail for j\. embiid/i }));
    fireEvent.click(screen.getByRole('button', { name: /2pt 3pt ft/i }));

    expect(changeStatOn).toHaveBeenCalledWith(0);
  });

  it('does not expose the player sheet trigger outside the mobile layout', () => {
    renderPlay(buildProps({ sectionWidth: 900 }));

    expect(
      screen.queryByRole('button', { name: /open player detail for j\. embiid/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-player-sheet')).not.toBeInTheDocument();
  });
});
