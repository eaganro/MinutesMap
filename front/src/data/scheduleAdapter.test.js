import { describe, expect, it } from 'vitest';
import { normalizeInitPayload, normalizeSchedulePayload } from './scheduleAdapter';

describe('scheduleAdapter', () => {
  it('normalizes schedule entries and stringifies ids', () => {
    const schedule = normalizeSchedulePayload([
      { id: 22500001, status: 'Final' },
      { id: '2026-02-03-phi-gsw', status: 'Q2 09:00' },
      { status: 'No id' },
      null,
    ]);

    expect(schedule).toEqual([
      { id: '22500001', status: 'Final' },
      { id: '2026-02-03-phi-gsw', status: 'Q2 09:00' },
      { status: 'No id' },
    ]);
  });

  it('returns an empty schedule when payload is not an array', () => {
    expect(normalizeSchedulePayload(null)).toEqual([]);
    expect(normalizeSchedulePayload({ games: [] })).toEqual([]);
  });

  it('normalizes init payload using validated date and trimmed auto-select id', () => {
    const normalized = normalizeInitPayload(
      {
        date: '2026-02-03',
        autoSelectGameId: ' 2026-02-03-phi-gsw ',
      },
      { fallbackDate: '2026-02-01' },
    );

    expect(normalized).toEqual({
      date: '2026-02-03',
      autoSelectGameId: '2026-02-03-phi-gsw',
    });
  });

  it('falls back when init payload date is missing or invalid', () => {
    expect(normalizeInitPayload({}, { fallbackDate: '2026-02-01' })).toEqual({
      date: '2026-02-01',
      autoSelectGameId: null,
    });

    expect(
      normalizeInitPayload(
        {
          date: '02/03/2026',
          autoSelectGameId: '',
        },
        { fallbackDate: '2026-02-01' },
      ),
    ).toEqual({
      date: '2026-02-01',
      autoSelectGameId: null,
    });
  });
});
