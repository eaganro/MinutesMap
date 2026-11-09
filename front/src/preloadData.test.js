import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';

const preloadSource = readFileSync(resolve(cwd(), 'public/preload-data.js'), 'utf8');

const preloadsFor = (url, prefix = '') => {
  window.history.replaceState({}, '', url);
  const tag = document.createElement('script');
  tag.setAttribute('src', '/preload-data.js');
  if (prefix !== null) tag.setAttribute('data-prefix', prefix);
  document.head.appendChild(tag);
  window.eval(preloadSource);
  tag.remove();
  return Array.from(document.head.querySelectorAll('link[rel="preload"]')).map((link) => ({
    href: link.getAttribute('href'),
    as: link.getAttribute('as'),
    crossOrigin: link.crossOrigin,
  }));
};

describe('preload-data.js', () => {
  afterEach(() => {
    document.head.querySelectorAll('link[rel="preload"]').forEach((link) => link.remove());
    window.history.replaceState({}, '', '/');
  });

  it("starts the game's schedule and data downloads for a game page", () => {
    expect(preloadsFor('/2026-11-06-PHI-CLE?team=PHI&q=4')).toEqual([
      { href: '/schedule/2026-11-06.json.gz', as: 'fetch', crossOrigin: 'anonymous' },
      { href: '/data/gamepack/2026-11-06-phi-cle.json.gz', as: 'fetch', crossOrigin: 'anonymous' },
    ]);
  });

  it('handles date paths and the old gameid parameter', () => {
    expect(preloadsFor('/2026-11-06').map((link) => link.href)).toEqual([
      '/schedule/2026-11-06.json.gz',
    ]);
    document.head.querySelectorAll('link[rel="preload"]').forEach((link) => link.remove());
    expect(preloadsFor('/?gameid=2026-11-06-phi-cle').map((link) => link.href)).toEqual([
      '/schedule/2026-11-06.json.gz',
      '/data/gamepack/2026-11-06-phi-cle.json.gz',
    ]);
  });

  it('uses the data location the build gives it, and does nothing without one', () => {
    expect(preloadsFor('/2026-11-06', 'https://minutesmap.com').map((link) => link.href)).toEqual([
      'https://minutesmap.com/schedule/2026-11-06.json.gz',
    ]);
    document.head.querySelectorAll('link[rel="preload"]').forEach((link) => link.remove());
    expect(preloadsFor('/2026-11-06', null)).toEqual([]);
  });

  it('leaves pages without a date to the app', () => {
    expect(preloadsFor('/')).toEqual([]);
    expect(preloadsFor('/?team=PHI')).toEqual([]);
  });
});
