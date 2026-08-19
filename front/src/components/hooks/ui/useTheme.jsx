import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { isBooleanPreference, readStoredValue, writeStoredValue } from '../state/storage';

const ThemeContext = createContext();
const DARK_MODE_STORAGE_KEY = 'darkMode';
const DARK_MODE_STORAGE_OPTIONS = { validate: isBooleanPreference };

// Check if user has a system color scheme preference
function getSystemPreference() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)');

  // If user has explicitly set a system preference, use it
  if (prefersDark.matches) return true;
  if (prefersLight.matches) return false;

  // No system preference set, default to dark mode
  return true;
}

export function ThemeProvider({ children }) {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return readStoredValue(DARK_MODE_STORAGE_KEY, getSystemPreference(), DARK_MODE_STORAGE_OPTIONS);
  });

  useEffect(() => {
    writeStoredValue(DARK_MODE_STORAGE_KEY, isDarkMode);
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      // Only follow system if user hasn't explicitly set a preference
      const saved = readStoredValue(DARK_MODE_STORAGE_KEY, null, DARK_MODE_STORAGE_OPTIONS);
      if (saved === null) {
        setIsDarkMode(getSystemPreference());
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => !prev);
  }, []);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
