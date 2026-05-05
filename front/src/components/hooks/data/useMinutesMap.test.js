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
}));

vi.mock('../schedule/useQueryParams', () => ({
  useQueryParams: () => ({
    getInitialParams: () => ({ date: '2026-02-03', gameId: '2026-02-03-phi-gsw' }),
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

describe('useMinutesMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        changeGame: mocks.changeGameMock,
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
        statOn: [true, false, true, true, false, false, false, false],
      }),
    );
    expect(result.current.statControlsVm).toEqual(
      expect.objectContaining({
        statOn: [true, false, true, true, false, false, false, false],
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

    act(() => {
      result.current.statControlsVm.changeStatOn(2);
    });

    expect(mocks.setStatOnMock).toHaveBeenCalledTimes(1);
    const updater = mocks.setStatOnMock.mock.calls[0][0];
    expect(typeof updater).toBe('function');
  });
});
