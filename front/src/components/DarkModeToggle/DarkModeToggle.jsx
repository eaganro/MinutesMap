import { useTheme } from '../hooks/ui/useTheme';
import './DarkModeToggle.scss';

export default function DarkModeToggle() {
  const { isDarkMode, toggleDarkMode } = useTheme();

  return (
    <button
      className="dark-mode-toggle"
      onClick={toggleDarkMode}
      aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <div className="toggle-track">
        <span className="toggle-icon sun" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none" />
            <path
              strokeLinecap="round"
              d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3 7 7M17 17l1.7 1.7M18.7 5.3 17 7M7 17l-1.7 1.7"
            />
          </svg>
        </span>
        <span className="toggle-icon moon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a.7.7 0 0 0-.9-.9 9.9 9.9 0 1 0 12.8 12.8.7.7 0 0 0-.9-.9Z" />
          </svg>
        </span>
        <div className={`toggle-thumb ${isDarkMode ? 'dark' : 'light'}`} />
      </div>
    </button>
  );
}
