import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, afterEach } from 'vitest';
import { useQueryParams } from './useQueryParams';

function setUrl(url) {
  window.history.replaceState({}, '', url);
}

afterEach(() => {
  setUrl('/');
});

describe('useQueryParams', () => {
  it('parses game slug from pathname before query params', () => {
    setUrl('/2026-02-03-phi-gsw?date=2026-01-01&gameid=invalid#chart');

    const { result } = renderHook(() => useQueryParams());
    expect(result.current.getInitialParams()).toEqual({
      date: '2026-02-03',
      gameId: '2026-02-03-phi-gsw',
    });
  });

  it('parses date-only pathname', () => {
    setUrl('/2026-02-03');

    const { result } = renderHook(() => useQueryParams());
    expect(result.current.getInitialParams()).toEqual({
      date: '2026-02-03',
      gameId: null,
    });
  });

  it('falls back to query params when pathname is empty', () => {
    setUrl('/?gameid=2026-02-05-lal-bos&date=2026-02-01');

    const { result } = renderHook(() => useQueryParams());
    expect(result.current.getInitialParams()).toEqual({
      date: '2026-02-05',
      gameId: '2026-02-05-lal-bos',
    });
  });

  it('returns null params for unknown path without valid query fallback', () => {
    setUrl('/not-a-valid-route?gameid=not-a-slug');

    const { result } = renderHook(() => useQueryParams());
    expect(result.current.getInitialParams()).toEqual({
      date: null,
      gameId: null,
    });
  });

  it('updates URL path from gameId while preserving non-game query params and hash', () => {
    setUrl('/2026-02-03-phi-gsw?keep=1&date=2026-01-01&gameid=old-slug#details');

    const { result } = renderHook(() => useQueryParams());

    act(() => {
      result.current.updateQueryParams('2026-02-04', '2026-02-04-nyk-mia');
    });

    expect(window.location.pathname).toBe('/2026-02-04-nyk-mia');
    expect(window.location.search).toBe('?keep=1');
    expect(window.location.hash).toBe('#details');
  });
});
