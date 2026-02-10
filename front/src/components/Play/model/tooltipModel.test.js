import { describe, expect, it } from 'vitest';
import {
  buildTooltipRenderItems,
  compareTeamActions,
  groupTooltipItemsByTeam,
  parseSubstitutionNames,
  pickPrimaryTooltipAction,
} from './tooltipModel';

describe('tooltipModel', () => {
  it('orders free throws by attempt within team actions', () => {
    const ordered = [
      {
        actionNumber: 12,
        actionType: 'freethrow',
        description: 'FT 2 of 2',
      },
      {
        actionNumber: 11,
        actionType: 'freethrow',
        description: 'FT 1 of 2',
      },
    ].sort(compareTeamActions);

    expect(ordered.map((action) => action.actionNumber)).toEqual([11, 12]);
  });

  it('parses substitution names across supported description formats', () => {
    expect(parseSubstitutionNames('SUB: Gary Payton II for Buddy Hield')).toEqual({
      inPlayer: 'Gary Payton II',
      outPlayer: 'Buddy Hield',
    });

    expect(parseSubstitutionNames('Sub In: Andrew Wiggins, Sub Out: Moses Moody')).toEqual({
      inPlayer: 'Andrew Wiggins, Sub Out: Moses Moody',
      outPlayer: 'Moses Moody',
    });
  });

  it('groups tooltip actions and builds sorted render items per team', () => {
    const descriptionArray = [
      {
        actionNumber: 40,
        side: 'away',
        actionType: 'assist',
        description: 'Away Guard assist',
      },
      {
        actionNumber: 41,
        side: 'away',
        actionType: '2pt',
        result: 'm',
        description: 'Away Guard makes layup',
      },
      {
        actionNumber: 42,
        side: 'home',
        actionType: 'substitution',
        description: 'SUB: Home Wing for Home Center',
      },
    ];

    const { actionsByTeam, subsByTeam } = groupTooltipItemsByTeam({
      descriptionArray,
      awayTeamAbr: 'PHI',
    });

    const items = buildTooltipRenderItems({
      actionsByTeam,
      subsByTeam,
      teamColors: { away: '#123456', home: '#654321' },
    });

    expect(items.map((item) => item.action.description)).toEqual([
      'Away Guard makes layup',
      'Away Guard assist',
      'SUB in: Home Wing',
      'SUB out: Home Center',
    ]);
    expect(items[0].teamColor).toBe('#123456');
    expect(items[2].isSubSummary).toBe(true);
  });

  it('prefers focused action, then latest scored action, then first fallback', () => {
    const actions = [
      { actionNumber: 1, description: 'Rebound', actionType: 'rebound' },
      { actionNumber: 5, description: 'Shot made', actionType: '2pt', scoreAway: 10, scoreHome: 9 },
      { actionNumber: 6, description: 'Shot made', actionType: '2pt', scoreAway: 12, scoreHome: 9 },
    ];

    expect(pickPrimaryTooltipAction(actions, { actionNumber: 1 })?.actionNumber).toBe(1);
    expect(pickPrimaryTooltipAction(actions, null)?.actionNumber).toBe(6);
    expect(
      pickPrimaryTooltipAction([{ actionNumber: 2, description: 'Foul' }], null)?.actionNumber,
    ).toBe(2);
  });
});
