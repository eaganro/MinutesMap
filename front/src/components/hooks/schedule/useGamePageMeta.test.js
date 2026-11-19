import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { describeGamePage, useGamePageMeta } from './useGamePageMeta';

describe('describeGamePage', () => {
  it('names the teams and date from the game slug', () => {
    expect(describeGamePage('2026-11-18-bos-phi')).toEqual({
      title: 'Boston Celtics at Philadelphia 76ers, Nov 18, 2026 | MinutesMap',
      description:
        'Minute-by-minute map of Boston Celtics at Philadelphia 76ers on November 18, 2026: play-by-play, rotations, lineups and the box score.',
      url: 'https://minutesmap.com/2026-11-18-bos-phi',
    });
  });

  it('falls back to the tricode for teams it does not know', () => {
    expect(describeGamePage('2026-02-15-eps-wst').title).toBe(
      'EPS at WST, Feb 15, 2026 | MinutesMap',
    );
  });

  it('returns null for anything that is not a game slug', () => {
    expect(describeGamePage(null)).toBeNull();
    expect(describeGamePage('2026-11-18')).toBeNull();
  });
});

describe('useGamePageMeta', () => {
  const defaultDescription = 'MinutesMap is a live NBA game map.';
  const description = () =>
    document.querySelector('meta[name="description"]').getAttribute('content');
  const canonicals = () =>
    Array.from(document.querySelectorAll('link[rel="canonical"]')).map((link) => link.href);

  beforeEach(() => {
    document.head.innerHTML = `<meta name="description" content="${defaultDescription}">`;
    document.title = 'MinutesMap';
  });

  it('sets the game page head and restores the defaults without a game', () => {
    const { rerender } = renderHook(({ gameId }) => useGamePageMeta(gameId), {
      initialProps: { gameId: '2026-11-18-bos-phi' },
    });

    expect(document.title).toBe('Boston Celtics at Philadelphia 76ers, Nov 18, 2026 | MinutesMap');
    expect(description()).toMatch(/^Minute-by-minute map of Boston Celtics at Philadelphia 76ers/);
    expect(canonicals()).toEqual(['https://minutesmap.com/2026-11-18-bos-phi']);

    rerender({ gameId: '2026-11-19-phi-mia' });
    expect(document.title).toBe('Philadelphia 76ers at Miami Heat, Nov 19, 2026 | MinutesMap');
    expect(canonicals()).toEqual(['https://minutesmap.com/2026-11-19-phi-mia']);

    rerender({ gameId: null });
    expect(document.title).toBe('MinutesMap');
    expect(description()).toBe(defaultDescription);
    expect(canonicals()).toEqual([]);
  });
});
