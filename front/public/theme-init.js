(function () {
  function getStorage() {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  function readPreference() {
    const storage = getStorage();
    if (!storage) return null;

    let stored;
    try {
      stored = storage.getItem('darkMode');
    } catch {
      return null;
    }

    if (stored === null) return null;

    try {
      const value = JSON.parse(stored);
      if (typeof value === 'boolean') return value;
    } catch {
      // Invalid values are removed below.
    }

    try {
      storage.removeItem('darkMode');
    } catch {
      // Storage may become unavailable between operations.
    }
    return null;
  }

  function writePreference(isDark) {
    const storage = getStorage();
    if (!storage) return false;

    try {
      storage.setItem('darkMode', JSON.stringify(isDark));
      return true;
    } catch {
      return false;
    }
  }

  function getSystemPreference() {
    try {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) return true;
      if (window.matchMedia('(prefers-color-scheme: light)').matches) return false;
    } catch {
      // Older browsers may not expose matchMedia.
    }
    return true;
  }

  // The page background (--bg-page) in each theme, for the browser's toolbar.
  const THEME_COLORS = { dark: '#0d0f12', light: '#eef0f3' };

  function applyTheme(isDark) {
    const theme = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', THEME_COLORS[theme]);
  }

  const theme = {
    applyTheme,
    getSystemPreference,
    readPreference,
    writePreference,
  };

  window.MinutesMapTheme = theme;
  applyTheme(readPreference() ?? getSystemPreference());
})();
