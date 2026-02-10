import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useGameTimeline } from './useGameTimeline';
import {
  compactPlayByPlayPayload,
  expectedCompactNormalized,
  expectedLegacyNormalized,
  legacyPlayByPlayPayload,
} from '../../domain/game-data/__fixtures__/playByPlayFixtures';

const STAT_ON = [true, false, true, true, false, false, false, false];

describe('useGameTimeline', () => {
  it('returns the empty contract for unsupported payloads', () => {
    const { result } = renderHook(() => useGameTimeline([], STAT_ON));

    expect(result.current).toEqual({
      scoreTimeline: [],
      homePlayerTimeline: {},
      awayPlayerTimeline: {},
      allActions: [],
      awayActions: {},
      homeActions: {},
      awayActionsAll: {},
      homeActionsAll: {},
    });
  });

  it('keeps legacy payload output contract stable', () => {
    const { result } = renderHook(() => useGameTimeline(legacyPlayByPlayPayload, STAT_ON));

    expect(result.current.scoreTimeline).toEqual(expectedLegacyNormalized.scoreTimeline);
    expect(result.current.awayPlayerTimeline).toEqual(expectedLegacyNormalized.awayPlayerTimeline);
    expect(result.current.homePlayerTimeline).toEqual(expectedLegacyNormalized.homePlayerTimeline);
    expect(result.current.allActions).toEqual(expectedLegacyNormalized.allActions);
    expect(result.current.awayActionsAll).toEqual(expectedLegacyNormalized.awayActionsAll);
    expect(result.current.homeActionsAll).toEqual(expectedLegacyNormalized.homeActionsAll);

    expect(result.current.awayActions).toEqual({
      'Away One': [
        {
          period: 1,
          clock: 'PT10M32.00S',
          actionType: '2pt',
          description: 'Away One makes 2PT driving layup',
          result: 'm',
          actionNumber: 11,
          scoreAway: 2,
          scoreHome: 0,
        },
        {
          period: 1,
          clock: 'PT09M58.00S',
          actionType: 'rebound',
          description: 'Away One defensive rebound',
          actionNumber: 13,
        },
      ],
      'Away Two': [],
    });

    expect(result.current.homeActions).toEqual({
      'Home One': [],
      'Home Two': [],
    });
  });

  it('keeps compact payload output contract stable', () => {
    const { result } = renderHook(() => useGameTimeline(compactPlayByPlayPayload, STAT_ON));

    expect(result.current.scoreTimeline).toEqual(expectedCompactNormalized.scoreTimeline);
    expect(result.current.awayPlayerTimeline).toEqual(expectedCompactNormalized.awayPlayerTimeline);
    expect(result.current.homePlayerTimeline).toEqual(expectedCompactNormalized.homePlayerTimeline);
    expect(result.current.allActions).toEqual(expectedCompactNormalized.allActions);
    expect(result.current.awayActionsAll).toEqual(expectedCompactNormalized.awayActionsAll);
    expect(result.current.homeActionsAll).toEqual(expectedCompactNormalized.homeActionsAll);

    expect(result.current.awayActions).toEqual({
      'Away Guard': [
        {
          period: 1,
          clock: 'PT11M00.00S',
          actionType: '2pt',
          description: 'Away Guard makes driving layup',
          result: 'm',
          subType: undefined,
          actionNumber: 101,
          scoreAway: 2,
          scoreHome: 0,
          side: 'away',
        },
      ],
    });

    expect(result.current.homeActions).toEqual({
      'Home Wing': [
        {
          period: 1,
          clock: 'PT10M45.00S',
          actionType: 'assist',
          description: 'Home Wing assist',
          result: undefined,
          subType: undefined,
          actionNumber: 103,
          scoreAway: undefined,
          scoreHome: undefined,
          side: 'home',
        },
        {
          period: 2,
          clock: 'PT11M50.00S',
          actionType: '3pt',
          description: 'Home Wing 3PT Jump Shot',
          result: 'm',
          subType: undefined,
          actionNumber: 201,
          scoreAway: 2,
          scoreHome: 3,
          side: 'home',
        },
      ],
    });
  });
});
