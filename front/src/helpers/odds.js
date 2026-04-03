import { getSecondsElapsed } from './playTimeline';

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

export const formatWinProbabilityPercent = (value) => {
  const probability = clampWinProbability(value);
  if (probability === null) return null;

  const percentage = Math.round(probability * 1000) / 10;
  return Number.isInteger(percentage) ? `${percentage.toFixed(0)}%` : `${percentage.toFixed(1)}%`;
};

export const findWinProbabilityAtOrBefore = (oddsTimeline, period, clock) => {
  if (!Array.isArray(oddsTimeline) || !oddsTimeline.length) {
    return null;
  }

  const targetSeconds = getSecondsElapsed(period, clock);
  if (!Number.isFinite(targetSeconds)) {
    return null;
  }

  let resolvedProbability = null;
  let resolvedSeconds = -Infinity;

  oddsTimeline.forEach((entry) => {
    const probability = clampWinProbability(entry?.awayWinProb);
    if (probability === null) return;

    const entrySeconds = getSecondsElapsed(entry?.period, entry?.clock);
    if (!Number.isFinite(entrySeconds) || entrySeconds > targetSeconds) return;

    if (entrySeconds >= resolvedSeconds) {
      resolvedProbability = probability;
      resolvedSeconds = entrySeconds;
    }
  });

  return resolvedProbability;
};
