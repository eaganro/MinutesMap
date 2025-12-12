import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext();

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
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) {
      return JSON.parse(saved);
    }
    // Check system preference, default to dark if none set
    return getSystemPreference();
  });

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const saved = localStorage.getItem('darkMode');
      // Only follow system if user hasn't explicitly set a preference
      if (saved === null) {
        setIsDarkMode(getSystemPreference());
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode(prev => !prev);
  }, []);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

