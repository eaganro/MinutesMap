import { render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import App from './App';

const mocks = vi.hoisted(() => ({
  useMinutesMapMock: vi.fn(),
  scheduleMock: vi.fn(() => <div data-testid="schedule" />),
  scoreMock: vi.fn(() => <div data-testid="score" />),
  boxscoreMock: vi.fn(() => <div data-testid="boxscore" />),
  lineupsMock: vi.fn(() => <div data-testid="lineups" />),
  playMock: vi.fn(() => <div data-testid="play" />),
  statButtonsMock: vi.fn(() => <div data-testid="stat-buttons" />),
  darkModeToggleMock: vi.fn(() => <div data-testid="dark-mode-toggle" />),
  footerMock: vi.fn(() => <div data-testid="footer" />),
}));

vi.mock('../hooks', () => ({
  useMinutesMap: mocks.useMinutesMapMock,
}));

vi.mock('../Schedule/Schedule', () => ({
  default: mocks.scheduleMock,
}));

vi.mock('../Score/Score', () => ({
  default: mocks.scoreMock,
}));

vi.mock('../Boxscore/Boxscore', () => ({
  default: mocks.boxscoreMock,
}));

vi.mock('../Lineups/Lineups', () => ({
  default: mocks.lineupsMock,
}));

vi.mock('../Play/Play', () => ({
  default: mocks.playMock,
}));

vi.mock('../StatButtons/StatButtons', () => ({
  default: mocks.statButtonsMock,
}));

vi.mock('../DarkModeToggle/DarkModeToggle', () => ({
  default: mocks.darkModeToggleMock,
}));

vi.mock('../Footer/Footer', () => ({
  default: mocks.footerMock,
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wires grouped minutes-map view models into child component props', () => {
    const changeDate = vi.fn();
    const changeGame = vi.fn();
    const changeStatOn = vi.fn();
    const setShowScoreDiff = vi.fn();
    const playByPlaySectionRef = { current: null };

    mocks.useMinutesMapMock.mockReturnValue({
      scheduleVm: {
        games: [{ id: '2026-02-03-phi-gsw' }],
        date: '2026-02-03',
        gameId: '2026-02-03-phi-gsw',
        changeDate,
        changeGame,
        isLoading: false,
      },
      scoreVm: {
        homeTeam: 'GSW',
        awayTeam: 'PHI',
        currentScore: { scoreAway: 92, scoreHome: 95 },
        gameDate: '2026-02-03T20:00:00',
        gameStatusMessage: null,
        isLoading: false,
        lastAction: { period: 4, clock: 'PT00M20.00S' },
        gameStatus: 'Q4 00:20',
      },
      playVm: {
        gameId: '2026-02-03-phi-gsw',
        nbaGameId: '0022500001',
        gameStatus: 'Q4 00:20',
        box: { teams: { away: { abbr: 'PHI' }, home: { abbr: 'GSW' } } },
        playData: {
          awayTeamNames: { name: 'Philadelphia 76ers', abr: 'PHI' },
          homeTeamNames: { name: 'Golden State Warriors', abr: 'GSW' },
          playerActions: {
            away: { filtered: { 'Away One': [] }, all: { 'Away One': [] } },
            home: { filtered: { 'Home One': [] }, all: { 'Home One': [] } },
          },
          allActions: [{ actionNumber: 1 }],
          scoreTimeline: [
            { scoreAway: 0, scoreHome: 0 },
            { scoreAway: 92, scoreHome: 95 },
          ],
          awayPlayerTimeline: { 'Away One': [] },
          homePlayerTimeline: { 'Home One': [] },
          numQs: 4,
          lastAction: { period: 4, clock: 'PT00M20.00S' },
          gameDate: '2026-02-03T20:00:00',
        },
        playByPlaySectionRef,
        playByPlaySectionWidth: 640,
        isLoading: false,
        statusMessage: null,
        showScoreDiff: true,
        statOn: [true, false, true, true, false, false, false, false],
      },
      statControlsVm: {
        statOn: [true, false, true, true, false, false, false, false],
        changeStatOn,
        showScoreDiff: true,
        setShowScoreDiff,
        isLoading: false,
        statusMessage: null,
      },
      boxVm: {
        box: { teams: { away: { abbr: 'PHI' }, home: { abbr: 'GSW' } } },
        isLoading: false,
        statusMessage: null,
      },
      lineupsVm: {
        awayTeam: { name: 'Philadelphia 76ers', abr: 'PHI' },
        homeTeam: { name: 'Golden State Warriors', abr: 'GSW' },
        awayLineups: [],
        homeLineups: [],
        isLoading: false,
        statusMessage: null,
      },
    });

    render(<App />);

    expect(mocks.useMinutesMapMock).toHaveBeenCalledTimes(1);

    expect(mocks.scheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        games: [{ id: '2026-02-03-phi-gsw' }],
        date: '2026-02-03',
        selectedGameId: '2026-02-03-phi-gsw',
        changeDate,
        changeGame,
        isLoading: false,
      }),
      {},
    );
    expect(mocks.scoreMock).toHaveBeenCalledWith(
      expect.objectContaining({
        homeTeam: 'GSW',
        awayTeam: 'PHI',
        score: { scoreAway: 92, scoreHome: 95 },
        changeDate,
        statusMessage: null,
        gameStatus: 'Q4 00:20',
      }),
      {},
    );
    expect(mocks.playMock).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: '2026-02-03-phi-gsw',
        nbaGameId: '0022500001',
        sectionWidth: 640,
        statusMessage: null,
        showScoreDiff: true,
      }),
      {},
    );
    expect(mocks.statButtonsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statOn: [true, false, true, true, false, false, false, false],
        changeStatOn,
        showScoreDiff: true,
        setShowScoreDiff,
      }),
      {},
    );
    expect(mocks.boxscoreMock).toHaveBeenCalledWith(
      expect.objectContaining({
        box: { teams: { away: { abbr: 'PHI' }, home: { abbr: 'GSW' } } },
        isLoading: false,
        statusMessage: null,
      }),
      {},
    );
    expect(mocks.lineupsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        awayTeam: { name: 'Philadelphia 76ers', abr: 'PHI' },
        homeTeam: { name: 'Golden State Warriors', abr: 'GSW' },
        awayLineups: [],
        homeLineups: [],
        isLoading: false,
        statusMessage: null,
      }),
      {},
    );
  });
});
