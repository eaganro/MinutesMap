(function () {
  const root = document.documentElement;
  const stored = localStorage.getItem('darkMode');
  let isDark;

  if (stored !== null) {
    isDark = JSON.parse(stored);
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    if (prefersDark) {
      isDark = true;
    } else if (prefersLight) {
      isDark = false;
    } else {
      isDark = true;
    }
  }

  root.setAttribute('data-theme', isDark ? 'dark' : 'light');
})();
