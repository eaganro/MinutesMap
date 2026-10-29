import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useMinutesMap } from './useMinutesMap';

const mocks = vi.hoisted(() => ({
  updateQueryParamsMock: vi.fn(),
  changeDateMock: vi.fn(),
  changeGameMock: vi.fn(),
  setStatOnMock: vi.fn(),
  setShowScoreDiffMock: vi.fn(),
  setShowOddsMock: vi.fn(),
  fetchGamePackWithReasonMock: vi.fn(),
  fetchScheduleWithReasonMock: vi.fn(),
  lastGamePackFetchRef: { current: { at: 0, reason: null } },
  lastScheduleFetchRef: { current: { at: 0, reason: null } },
  useResumeRefreshMock: vi.fn(),
  useAnalyticsSignalsMock: vi.fn(),
  playRef: { current: null },
  currentUrlParams: { date: '2026-02-03', gameId: '2026-02-03-phi-gsw' },
  gameDataOverrides: {},
  useTeamScheduleMock: vi.fn(),
}));

vi.mock('../schedule/useTeamSchedule', () => ({
  useTeamSchedule: mocks.useTeamScheduleMock,
}));

vi.mock('../schedule/useQueryParams', () => ({
  useQueryParams: () => ({
    getInitialParams: () => mocks.currentUrlParams,
    updateQueryParams: mocks.updateQueryParamsMock,
  }),
}));

vi.mock('../state/useLocalStorageState', () => ({
  useLocalStorageState: (key, defaultValue) => {
    if (key === 'statOn') {
      return [defaultValue, mocks.setStatOnMock];
    }
    if (key === 'showScoreDiff') {
      return [true, mocks.setShowScoreDiffMock];
    }
    if (key === 'showOddsOverlay') {
      return [false, mocks.setShowOddsMock];
    }
    return [defaultValue, vi.fn()];
  },
}));

vi.mock('./useGameData', () => ({
  useGameData: () => ({
    schedule: [
      {
        id: '2026-02-03-phi-gsw',
        status: 'Q2 09:00',
        hometeam: 'GSW',
        awayteam: 'PHI',
        starttime: '2026-02-03T20:00:00',
      },
    ],
    fetchSchedule: vi.fn(),
    isScheduleLoading: false,
    box: {
      start: '2026-02-03T20:00:00',
      teams: {
        away: { id: 1, name: 'Philadelphia 76ers', abbr: 'PHI' },
        home: { id: 2, name: 'Golden State Warriors', abbr: 'GSW' },
      },
    },
    playByPlay: { v: 2, actions: [] },
    awayTeamId: 1,
    homeTeamId: 2,
    nbaGameId: '0022500001',
    numPeriods: 4,
    lastAction: { period: 2, clock: 'PT09M00.00S' },
    captions: {
      v: 1,
      periods: {
        1: {
          full: 'PHI starts quickly and carries momentum through Q1.',
          players: [],
        },
      },
    },
    gameStatusMessage: null,
    isBoxLoading: false,
    isPlayLoading: false,
    fetchGamePack: vi.fn(),
    setGameNotStarted: vi.fn(),
    resetLoadingStates: vi.fn(),
    ...mocks.gameDataOverrides,
  }),
}));

vi.mock('../schedule/useSelectedGameState', () => ({
  useSelectedGameState: () => ({
    gameId: '2026-02-03-phi-gsw',
    setGameId: vi.fn(),
    changeGame: mocks.changeGameMock,
    selectedScheduleGame: {
      id: '2026-02-03-phi-gsw',
      status: 'Q2 09:00',
      hometeam: 'GSW',
      awayteam: 'PHI',
      starttime: '2026-02-03T20:00:00',
    },
    stableGameMeta: {
      id: '2026-02-03-phi-gsw',
      status: 'Q2 09:00',
      hometeam: 'GSW',
      awayteam: 'PHI',
      starttime: '2026-02-03T20:00:00',
    },
    currentScheduleGameStatus: 'Q2 09:00',
    isSelectedGameUpcoming: false,
    isSelectedGameFinal: false,
  }),
}));

vi.mock('../schedule/useScheduleState', () => ({
  useScheduleState: () => ({
    date: '2026-02-03',
    isInitLoading: false,
    changeDate: mocks.changeDateMock,
    sortedGames: [
      {
        id: '2026-02-03-phi-gsw',
      },
    ],
  }),
}));

vi.mock('./useGamePackSync', () => ({
  useGamePackSync: () => ({
    fetchGamePackWithReason: mocks.fetchGamePackWithReasonMock,
    fetchScheduleWithReason: mocks.fetchScheduleWithReasonMock,
    lastGamePackFetchRef: mocks.lastGamePackFetchRef,
    lastScheduleFetchRef: mocks.lastScheduleFetchRef,
  }),
}));

vi.mock('../realtime/useLiveUpdates', () => ({
  useLiveUpdates: () => ({
    ws: { readyState: 1 },
  }),
}));

vi.mock('../realtime/useResumeRefresh', () => ({
  useResumeRefresh: mocks.useResumeRefreshMock,
}));

vi.mock('../analytics/useAnalyticsSignals', () => ({
  useAnalyticsSignals: mocks.useAnalyticsSignalsMock,
}));

vi.mock('./useGameTimeline', () => ({
  useGameTimeline: () => ({
    scoreTimeline: [
      { scoreAway: 0, scoreHome: 0 },
      { scoreAway: 12, scoreHome: 14 },
    ],
    oddsTimeline: [{ period: 2, clock: 'PT09M00.00S', awayWinProb: 0.58 }],
    homePlayerTimeline: { HomeA: [] },
    awayPlayerTimeline: { AwayA: [] },
    allActions: [{ actionNumber: 1 }],
    playerActions: {
      away: { filtered: { AwayA: [] }, all: { AwayA: [] } },
      home: { filtered: { HomeA: [] }, all: { HomeA: [] } },
    },
  }),
}));

vi.mock('../ui/useElementWidth', () => ({
  useElementWidth: () => [mocks.playRef, 640],
}));

vi.mock('./useLineupStats', () => ({
  useLineupStats: () => ({ away: [], home: [] }),
}));

const TEAM_SEASON_ROWS = {
  GSW: [
    {
      gameId: '2026-02-01-gsw-lal',
      date: '2026-02-01',
      homeAway: 'away',
      opponentAbbr: 'LAL',
      result: 'W',
      teamScore: 120,
      oppScore: 110,
    },
  ],
  BOS: [
    {
      gameId: '2026-02-02-bos-mia',
      date: '2026-02-02',
      homeAway: 'away',
      opponentAbbr: 'MIA',
      result: 'L',
      teamScore: 99,
      oppScore: 101,
    },
    {
      gameId: '2026-02-05-nyk-bos',
      date: '2026-02-05',
      homeAway: 'home',
      opponentAbbr: 'NYK',
      status: '7:00 pm ET',
      played: false,
      result: null,
    },
  ],
};

describe('useMinutesMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUrlParams = { date: '2026-02-03', gameId: '2026-02-03-phi-gsw' };
    mocks.gameDataOverrides = {};
    mocks.useTeamScheduleMock.mockImplementation(({ team, season }) => ({
      key: team && season ? `${team}/${season}` : null,
      status: team ? 'success' : 'idle',
      payload: team ? { games: TEAM_SEASON_ROWS[team] || [] } : null,
      error: null,
      retry: vi.fn(),
    }));
  });

  it('switches the schedule strip to a team season and back', () => {
    const { result } = renderHook(() => useMinutesMap());
    expect(result.current.scheduleVm.teamMode).toBeNull();

    act(() => {
      result.current.scheduleVm.selectTeam('gsw');
    });

    const { teamMode } = result.current.scheduleVm;
    expect(mocks.useTeamScheduleMock).toHaveBeenLastCalledWith({ team: 'GSW', season: '2025-26' });
    expect(teamMode.team).toBe('GSW');
    expect(teamMode.games.map((game) => game.id)).toEqual([
      '2026-02-01-gsw-lal',
      '2026-02-03-phi-gsw',
    ]);
    // The selected game already involves GSW, so entering team mode keeps it.
    expect(mocks.changeGameMock).not.toHaveBeenCalled();
    expect(teamMode.record).toEqual({ wins: 1, losses: 0, seasonType: 'regular' });
    expect(mocks.updateQueryParamsMock).toHaveBeenLastCalledWith(
      '2026-02-03',
      '2026-02-03-phi-gsw',
      { mode: 'replace', team: 'GSW' },
    );

    act(() => {
      result.current.scheduleVm.teamMode.changeGame('2026-02-01-gsw-lal');
    });
    expect(mocks.changeDateMock).toHaveBeenCalledWith('2026-02-01');
    expect(mocks.changeGameMock).toHaveBeenCalledWith('2026-02-01-gsw-lal');

    act(() => {
      result.current.scheduleVm.showDate('2026-02-03');
    });
    expect(result.current.scheduleVm.teamMode).toBeNull();
    expect(mocks.changeDateMock).toHaveBeenLastCalledWith('2026-02-03');
  });

  it('keeps the last live score seen for a team game after the schedule moves to another date', () => {
    mocks.gameDataOverrides.schedule = [
      {
        id: '2026-02-03-phi-gsw',
        date: '2026-02-03',
        status: 'Q3 05:12',
        hometeam: 'GSW',
        awayteam: 'PHI',
        homescore: 80,
        awayscore: 74,
        starttime: '2026-02-03T20:00:00',
      },
    ];
    const { result, rerender } = renderHook(() => useMinutesMap());
    act(() => {
      result.current.scheduleVm.selectTeam('GSW');
    });

    mocks.gameDataOverrides.schedule = [];
    rerender();

    const liveGame = result.current.scheduleVm.teamMode.games.find(
      (game) => game.id === '2026-02-03-phi-gsw',
    );
    expect(liveGame).toMatchObject({ status: 'Q3 05:12', teamScore: 80, oppScore: 74 });
    delete mocks.gameDataOverrides.schedule;
  });

  it('jumps to the team game nearest the viewed date when the current game is another team', () => {
    const { result } = renderHook(() => useMinutesMap());

    act(() => {
      result.current.scheduleVm.selectTeam('BOS');
    });

    expect(mocks.changeDateMock).toHaveBeenCalledWith('2026-02-02');
    expect(mocks.changeGameMock).toHaveBeenCalledWith('2026-02-02-bos-mia');
  });

  it('keeps the App-facing return contract stable and wires orchestration hooks', () => {
    const { result } = renderHook(() => useMinutesMap());

    expect(Object.keys(result.current).sort()).toEqual(
      ['scheduleVm', 'scoreVm', 'playVm', 'statControlsVm', 'boxVm', 'lineupsVm'].sort(),
    );

    expect(result.current.scheduleVm).toEqual(
      expect.objectContaining({
        date: '2026-02-03',
        gameId: '2026-02-03-phi-gsw',
        changeDate: mocks.changeDateMock,
        changeGame: expect.any(Function),
      }),
    );
    expect(result.current.scoreVm).toEqual(
      expect.objectContaining({
        homeTeam: 'GSW',
        awayTeam: 'PHI',
        currentScore: { scoreAway: 12, scoreHome: 14 },
        gameDate: '2026-02-03T20:00:00',
        gameStatusMessage: null,
        gameStatus: 'Q2 09:00',
      }),
    );
    expect(result.current.playVm).toEqual(
      expect.objectContaining({
        gameId: '2026-02-03-phi-gsw',
        nbaGameId: '0022500001',
        playData: {
          awayTeamNames: { name: 'Philadelphia 76ers', abr: 'PHI' },
          homeTeamNames: { name: 'Golden State Warriors', abr: 'GSW' },
          playerActions: {
            away: { filtered: { AwayA: [] }, all: { AwayA: [] } },
            home: { filtered: { HomeA: [] }, all: { HomeA: [] } },
          },
          allActions: [{ actionNumber: 1 }],
          scoreTimeline: [
            { scoreAway: 0, scoreHome: 0 },
            { scoreAway: 12, scoreHome: 14 },
          ],
          oddsTimeline: [{ period: 2, clock: 'PT09M00.00S', awayWinProb: 0.58 }],
          awayPlayerTimeline: { AwayA: [] },
          homePlayerTimeline: { HomeA: [] },
          numQs: 4,
          lastAction: { period: 2, clock: 'PT09M00.00S' },
          gameDate: '2026-02-03T20:00:00',
          captions: {
            v: 1,
            periods: {
              1: {
                full: 'PHI starts quickly and carries momentum through Q1.',
                players: [],
              },
            },
          },
        },
        playByPlaySectionRef: mocks.playRef,
        playByPlaySectionWidth: 640,
        statusMessage: null,
        showScoreDiff: true,
        showOdds: false,
        statOn: [true, false, false, true, false, false, false, false],
      }),
    );
    expect(result.current.statControlsVm).toEqual(
      expect.objectContaining({
        statOn: [true, false, false, true, false, false, false, false],
        changeStatOn: expect.any(Function),
        showScoreDiff: true,
        setShowScoreDiff: mocks.setShowScoreDiffMock,
        showOdds: false,
        setShowOdds: mocks.setShowOddsMock,
        statusMessage: null,
      }),
    );
    expect(result.current.boxVm).toEqual(
      expect.objectContaining({
        gameId: '2026-02-03-phi-gsw',
        box: expect.objectContaining({
          teams: expect.objectContaining({
            away: expect.objectContaining({ abbr: 'PHI' }),
            home: expect.objectContaining({ abbr: 'GSW' }),
          }),
        }),
        statusMessage: null,
      }),
    );
    expect(result.current.lineupsVm).toEqual(
      expect.objectContaining({
        gameId: '2026-02-03-phi-gsw',
        awayTeam: { name: 'Philadelphia 76ers', abr: 'PHI' },
        homeTeam: { name: 'Golden State Warriors', abr: 'GSW' },
        awayLineups: [],
        homeLineups: [],
        statusMessage: null,
      }),
    );

    expect(mocks.useResumeRefreshMock).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-02-03',
        gameId: '2026-02-03-phi-gsw',
        isSelectedGameFinal: false,
        isWebSocketOpen: true,
        lastGamePackFetchRef: mocks.lastGamePackFetchRef,
        lastScheduleFetchRef: mocks.lastScheduleFetchRef,
      }),
    );

    expect(mocks.useAnalyticsSignalsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-02-03',
        gameId: '2026-02-03-phi-gsw',
        currentScheduleGameStatus: 'Q2 09:00',
        isInitLoading: false,
      }),
    );
    expect(mocks.updateQueryParamsMock).toHaveBeenCalledWith('2026-02-03', '2026-02-03-phi-gsw', {
      mode: 'replace',
      team: null,
    });

    act(() => {
      result.current.scheduleVm.changeGame('2026-02-03-lal-bos');
    });

    expect(mocks.changeGameMock).toHaveBeenCalledWith('2026-02-03-lal-bos');

    act(() => {
      result.current.statControlsVm.changeStatOn(2);
    });

    expect(mocks.setStatOnMock).toHaveBeenCalledTimes(1);
    const updater = mocks.setStatOnMock.mock.calls[0][0];
    expect(typeof updater).toBe('function');
  });

  it('selects the game from browser history when popstate fires', () => {
    renderHook(() => useMinutesMap());
    vi.clearAllMocks();
    mocks.currentUrlParams = { date: '2026-02-03', gameId: '2026-02-03-lal-bos' };

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(mocks.changeDateMock).not.toHaveBeenCalled();
    expect(mocks.changeGameMock).toHaveBeenCalledWith('2026-02-03-lal-bos');
  });

  it('does not flash a stale error notice while loading the selected game', () => {
    mocks.gameDataOverrides = {
      loadedGameId: '2026-02-02-lal-bos',
      gameDataError: { message: 'Check your connection and try again.' },
      isBoxLoading: true,
      isPlayLoading: true,
    };

    const { result } = renderHook(() => useMinutesMap());

    expect(result.current.scoreVm.dataNotice).toBeNull();
    expect(result.current.scoreVm.gameStatus).toBeNull();
    expect(result.current.playVm.gameStatus).toBeNull();
    expect(result.current.playVm.gameId).toBe('2026-02-02-lal-bos');
    expect(result.current.boxVm.gameId).toBe('2026-02-02-lal-bos');
    expect(result.current.lineupsVm.gameId).toBe('2026-02-02-lal-bos');
  });

  it('provides a retry action when loading the selected game fails', () => {
    mocks.gameDataOverrides = {
      loadedGameId: '2026-02-02-lal-bos',
      gameDataError: { message: 'Check your connection and try again.' },
      isBoxLoading: false,
      isPlayLoading: false,
    };

    const { result } = renderHook(() => useMinutesMap());

    expect(result.current.scoreVm.dataNotice).toEqual(
      expect.objectContaining({
        tone: 'error',
        message: 'Couldn’t load the selected game. Showing data from the previous game.',
        retry: expect.any(Function),
      }),
    );

    act(() => {
      result.current.scoreVm.dataNotice.retry();
    });

    expect(mocks.fetchGamePackWithReasonMock).toHaveBeenCalledWith(
      { gameId: '2026-02-03-phi-gsw', showLoading: true },
      'retry',
    );
  });
});
