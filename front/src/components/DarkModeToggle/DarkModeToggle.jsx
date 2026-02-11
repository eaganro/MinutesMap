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
        <span className="toggle-icon sun">☀️</span>
        <span className="toggle-icon moon">🌙</span>
        <div className={`toggle-thumb ${isDarkMode ? 'dark' : 'light'}`} />
      </div>
    </button>
  );
}
