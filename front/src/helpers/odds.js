export const parseWinProbability = (value) => {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export const clampWinProbability = (value) => {
  const parsed = parseWinProbability(value);
  if (parsed === null) return null;
  return Math.max(0, Math.min(1, parsed));
};
