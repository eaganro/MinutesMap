import { useState, useEffect } from 'react';
import { readStoredValue, writeStoredValue } from './storage';

/**
 * Hook for managing state that persists to localStorage
 * @param {string} key - localStorage key
 * @param {*} defaultValue - Default value if nothing is stored
 * @param {{validate?: Function, migrate?: Function}} options - Per-key validation and migration
 * @returns {[*, Function]} - State value and setter
 */
export function useLocalStorageState(key, defaultValue, options = {}) {
  const [value, setValue] = useState(() => readStoredValue(key, defaultValue, options));

  useEffect(() => {
    writeStoredValue(key, value);
  }, [key, value]);

  return [value, setValue];
}
