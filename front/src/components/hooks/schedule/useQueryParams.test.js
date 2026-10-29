import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, afterEach, vi } from 'vitest';
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
      team: null,
    });
  });

  it('parses date-only pathname', () => {
    setUrl('/2026-02-03');

    const { result } = renderHook(() => useQueryParams());
    expect(result.current.getInitialParams()).toEqual({
      date: '2026-02-03',
      gameId: null,
      team: null,
    });
  });

  it('falls back to query params when pathname is empty', () => {
    setUrl('/?gameid=2026-02-05-lal-bos&date=2026-02-01');

    const { result } = renderHook(() => useQueryParams());
    expect(result.current.getInitialParams()).toEqual({
      date: '2026-02-05',
      gameId: '2026-02-05-lal-bos',
      team: null,
    });
  });

  it('returns null params for unknown path without valid query fallback', () => {
    setUrl('/not-a-valid-route?gameid=not-a-slug');

    const { result } = renderHook(() => useQueryParams());
    expect(result.current.getInitialParams()).toEqual({
      date: null,
      gameId: null,
      team: null,
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

  it('can push a new history entry for user-driven game changes', () => {
    setUrl('/2026-02-03-phi-gsw?keep=1#details');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    const { result } = renderHook(() => useQueryParams());

    act(() => {
      result.current.updateQueryParams('2026-02-04', '2026-02-04-nyk-mia', { mode: 'push' });
    });

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/2026-02-04-nyk-mia');
    expect(window.location.search).toBe('?keep=1');
    expect(window.location.hash).toBe('#details');
  });

  it('reads a known team from the query and ignores unknown ones', () => {
    setUrl('/2026-02-03-phi-gsw?team=bos');
    const { result } = renderHook(() => useQueryParams());
    expect(result.current.getInitialParams().team).toBe('BOS');

    setUrl('/?team=xyz');
    expect(result.current.getInitialParams().team).toBeNull();
  });

  it('sets and clears the team query param only when asked', () => {
    setUrl('/2026-02-03-phi-gsw?keep=1');
    const { result } = renderHook(() => useQueryParams());

    act(() => {
      result.current.updateQueryParams('2026-02-04', '2026-02-04-nyk-bos', { team: 'BOS' });
    });
    expect(window.location.search).toBe('?keep=1&team=BOS');

    act(() => {
      result.current.updateQueryParams('2026-02-05', '2026-02-05-bos-mia');
    });
    expect(window.location.search).toBe('?keep=1&team=BOS');

    act(() => {
      result.current.updateQueryParams('2026-02-05', '2026-02-05-bos-mia', { team: null });
    });
    expect(window.location.search).toBe('?keep=1');
  });
});
