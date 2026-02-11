import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useScheduleState } from './useScheduleState';
import { useSelectedGameState } from './useSelectedGameState';

function useScheduleSelectedSeam({ initialDate, initialGameId, schedule, isScheduleLoading }) {
  const resetLoadingStates = vi.fn();
  const fetchScheduleWithReason = vi.fn();

  const selectedState = useSelectedGameState({
    initialGameId,
    schedule,
    resetLoadingStates,
  });

  const scheduleState = useScheduleState({
    initialDate,
    initialGameId,
    gameId: selectedState.gameId,
    setGameId: selectedState.setGameId,
    schedule,
    isScheduleLoading,
    fetchScheduleWithReason,
  });

  return { selectedState, scheduleState, fetchScheduleWithReason };
}

describe('schedule + selected game seam', () => {
  it('auto-selects sorted game and keeps selected metadata aligned', async () => {
    const schedule = [
      {
        id: '2026-02-03-lal-bos',
        status: 'Final',
        hometeam: 'BOS',
        awayteam: 'LAL',
        starttime: '2026-02-03T18:00:00Z',
      },
      {
        id: '2026-02-03-phi-gsw',
        status: 'Q1 08:11',
        hometeam: 'GSW',
        awayteam: 'PHI',
        starttime: '2026-02-03T20:00:00Z',
      },
    ];

    const { result, rerender } = renderHook(
      ({ data, isScheduleLoading }) =>
        useScheduleSelectedSeam({
          initialDate: '2026-02-03',
          initialGameId: null,
          schedule: data,
          isScheduleLoading,
        }),
      {
        initialProps: {
          data: schedule,
          isScheduleLoading: false,
        },
      },
    );

    await waitFor(() => {
      expect(result.current.selectedState.gameId).toBe('2026-02-03-phi-gsw');
    });

    expect(result.current.scheduleState.sortedGames.map((game) => game.id)).toEqual([
      '2026-02-03-phi-gsw',
      '2026-02-03-lal-bos',
    ]);
    expect(result.current.selectedState.selectedScheduleGame?.id).toBe('2026-02-03-phi-gsw');
    expect(result.current.fetchScheduleWithReason).toHaveBeenCalledWith(
      '2026-02-03',
      'date-change',
    );

    rerender({ data: [], isScheduleLoading: true });

    expect(result.current.selectedState.selectedScheduleGame).toBeNull();
    expect(result.current.selectedState.stableGameMeta).toEqual(
      expect.objectContaining({
        id: '2026-02-03-phi-gsw',
        hometeam: 'GSW',
        awayteam: 'PHI',
      }),
    );
  });
});
