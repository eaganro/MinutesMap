import { describe, expect, it } from 'vitest';
import { buildExportRequestSnapshot } from './exportRangeModel';
import { buildExportRenderRequest } from './exportRequestModel';

describe('exportRequestModel', () => {
  it('builds stable structural request payloads for renderer input', () => {
    const snapshot = buildExportRequestSnapshot({
      resolvedExportRange: { start: 1, end: 2, isFullGame: false },
      exportView: 'player',
      exportPlayerKey: 'away:J. Brown',
      isFinal: false,
    });

    const request = buildExportRenderRequest({
      snapshot,
      exportView: 'player',
      selectedExportPlayer: { name: 'J. Brown', teamKey: 'away' },
      exportPlayerDisplayName: 'Jaylen Brown',
      leftMargin: 96,
      rightMargin: 10,
      playRef: { current: document.createElement('div') },
      gameDate: '2026-02-03',
      displayAwayTeamNames: { abr: 'PHI', name: '76ers' },
      displayHomeTeamNames: { abr: 'GSW', name: 'Warriors' },
      displayAwayPlayers: {
        'J. Brown': [{ period: 1, clock: 'PT11M00.00S', actionType: '2pt', description: 'Score' }],
      },
      displayAwayPlayersAll: null,
      displayHomePlayers: {},
      displayHomePlayersAll: null,
      displayAwayPlayerTimeline: {
        'J. Brown': [{ period: 1, start: 'PT12M00.00S', end: 'PT00M00.00S' }],
      },
      displayHomePlayerTimeline: {},
      displayScoreTimeline: [
        { period: 1, clock: 'PT12M00.00S', away: 0, home: 0 },
        { period: 1, clock: 'PT11M00.00S', away: 2, home: 0 },
      ],
      displayLastAction: { period: 1, clock: 'PT11M00.00S' },
      gameStatus: 'Q1 11:00',
      isFinal: false,
      numPeriods: 4,
      timelineWindow: { startSeconds: 0, durationSeconds: 2880 },
      showScoreDiff: true,
      statOn: [true, false, true, true, false, false, false, false],
      teamColors: { away: '#f00', home: '#00f' },
      awayColor: '#f00',
      homeColor: '#00f',
    });

    expect(request.exportRangeLabel).toBe('Q1-Q2');
    expect(request.exportIsFullGameRange).toBe(false);
    expect(request.renderInput).toEqual(
      expect.objectContaining({
        exportView: 'player',
        selectedPlayer: { name: 'J. Brown', teamKey: 'away' },
        playerDisplayName: 'Jaylen Brown',
        rangeLabel: 'Q1-Q2',
        periodRange: { start: 1, end: 2, isFullGame: false },
        rightMargin: 10,
        leftMargin: 96,
        showScoreDiff: false,
      }),
    );
    expect(request.renderInput.filteredAwayPlayers).toHaveProperty('J. Brown');
    expect(request.renderInput.filteredScoreTimeline.length).toBeGreaterThan(0);
  });
});
