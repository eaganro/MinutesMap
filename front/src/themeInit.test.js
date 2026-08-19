import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const themeInitSource = readFileSync(resolve(cwd(), 'public/theme-init.js'), 'utf8');
const themeToggleSource = readFileSync(
  resolve(cwd(), 'static-pages/assets/theme-toggle.js'),
  'utf8',
);
const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');

function runScript(source) {
  window.eval(source);
}

describe('shared theme initialization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'localStorage', localStorageDescriptor);
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.body.innerHTML = '';
    delete window.MinutesMapTheme;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn((query) => ({ matches: query.includes('light') })),
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', localStorageDescriptor);
    vi.restoreAllMocks();
  });

  it.each(['{broken', JSON.stringify('dark')])(
    'removes invalid stored theme %s and applies the system preference',
    (stored) => {
      localStorage.setItem('darkMode', stored);

      runScript(themeInitSource);

      expect(document.documentElement).toHaveAttribute('data-theme', 'light');
      expect(localStorage.getItem('darkMode')).toBeNull();
    },
  );

  it('initializes and toggles without crashing when localStorage is unavailable', () => {
    document.body.innerHTML = `
      <button class="dark-mode-toggle">
        <span class="toggle-thumb"></span>
      </button>
    `;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Denied', 'SecurityError');
      },
    });

    expect(() => runScript(themeInitSource)).not.toThrow();
    expect(() => runScript(themeToggleSource)).not.toThrow();
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');

    expect(() => document.querySelector('.dark-mode-toggle').click()).not.toThrow();
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });
});
