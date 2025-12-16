import { useState, useEffect } from 'react';

/**
 * Hook for managing state that persists to localStorage
 * @param {string} key - localStorage key
 * @param {*} defaultValue - Default value if nothing is stored
 * @returns {[*, Function]} - State value and setter
 */
export function useLocalStorageState(key, defaultValue) {
  const [value, setValue] = useState(() => {
    const saved = localStorage.getItem(key);
    if (saved !== null) {
      try {
        return JSON.parse(saved);
      } catch {
        return defaultValue;
      }
    }
    return defaultValue;
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

