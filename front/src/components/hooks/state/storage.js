function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function removeStoredValue(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    // Storage may be unavailable even after a successful read.
  }
}

export function writeStoredValue(key, value) {
  const storage = getStorage();
  if (!storage) return false;

  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return false;
    storage.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}

export function readStoredValue(key, fallbackValue, options = {}) {
  const { validate = () => true, migrate } = options;
  const storage = getStorage();
  if (!storage) return fallbackValue;

  let serialized;
  try {
    serialized = storage.getItem(key);
  } catch {
    return fallbackValue;
  }

  if (serialized === null) return fallbackValue;

  let storedValue;
  try {
    storedValue = JSON.parse(serialized);
  } catch {
    removeStoredValue(storage, key);
    return fallbackValue;
  }

  let value = storedValue;
  if (migrate) {
    try {
      value = migrate(storedValue);
    } catch {
      removeStoredValue(storage, key);
      return fallbackValue;
    }
  }

  let isValid = false;
  try {
    isValid = validate(value);
  } catch {
    isValid = false;
  }

  if (!isValid) {
    removeStoredValue(storage, key);
    return fallbackValue;
  }

  if (!Object.is(value, storedValue)) {
    writeStoredValue(key, value);
  }

  return value;
}

export const isBooleanPreference = (value) => typeof value === 'boolean';

export const isBooleanArrayPreference = (length) => (value) =>
  Array.isArray(value) && value.length === length && value.every(isBooleanPreference);
