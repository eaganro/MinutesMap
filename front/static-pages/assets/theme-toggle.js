(function () {
  const toggle = document.querySelector('.dark-mode-toggle');
  const thumb = document.querySelector('.toggle-thumb');

  if (!toggle || !thumb) {
    return;
  }

  function setToggleState(isDark) {
    thumb.classList.toggle('dark', isDark);
    thumb.classList.toggle('light', !isDark);
    toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    toggle.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  const stored = localStorage.getItem('darkMode');
  const isDark =
    stored !== null
      ? JSON.parse(stored)
      : document.documentElement.getAttribute('data-theme') === 'dark';
  setToggleState(isDark);

  toggle.addEventListener('click', function () {
    const current = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = !current;
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    localStorage.setItem('darkMode', JSON.stringify(next));
    setToggleState(next);
  });
})();
