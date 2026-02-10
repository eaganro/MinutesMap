import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSelectedGameState } from './useSelectedGameState';

describe('useSelectedGameState', () => {
  it('caches selected game metadata and preserves status while schedule reloads', () => {
    const resetLoadingStates = vi.fn();

    const { result, rerender } = renderHook(
      ({ schedule }) =>
        useSelectedGameState({
          initialGameId: '2026-02-03-phi-gsw',
          schedule,
          resetLoadingStates,
        }),
      {
        initialProps: {
          schedule: [
            {
              id: '2026-02-03-phi-gsw',
              hometeam: 'GSW',
              awayteam: 'PHI',
              starttime: '2026-02-03T20:00:00',
              status: 'Q2 10:11',
            },
          ],
        },
      },
    );

    expect(result.current.selectedScheduleGame?.id).toBe('2026-02-03-phi-gsw');
    expect(result.current.currentScheduleGameStatus).toBe('Q2 10:11');
    expect(result.current.isSelectedGameFinal).toBe(false);

    rerender({ schedule: [] });

    expect(result.current.selectedScheduleGame).toBeNull();
    expect(result.current.stableGameMeta).toEqual(
      expect.objectContaining({
        id: '2026-02-03-phi-gsw',
        hometeam: 'GSW',
        awayteam: 'PHI',
      }),
    );
    expect(result.current.currentScheduleGameStatus).toBe('Q2 10:11');

    act(() => {
      result.current.changeGame('2026-02-03-lal-bos');
    });

    expect(resetLoadingStates).toHaveBeenCalledTimes(1);
    expect(result.current.gameId).toBe('2026-02-03-lal-bos');

    rerender({
      schedule: [
        {
          id: '2026-02-03-lal-bos',
          hometeam: 'BOS',
          awayteam: 'LAL',
          starttime: '2026-02-03T21:00:00',
          status: 'Final',
        },
      ],
    });

    expect(result.current.currentScheduleGameStatus).toBe('Final');
    expect(result.current.isSelectedGameFinal).toBe(true);
  });
});
