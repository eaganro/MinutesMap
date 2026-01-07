import { timeToSeconds } from './utils';

const REGULATION_PERIOD_SECONDS = 12 * 60;
const OVERTIME_PERIOD_SECONDS = 5 * 60;
const REGULATION_SECONDS = REGULATION_PERIOD_SECONDS * 4;

export function getPeriodDurationSeconds(period) {
  const p = Number(period);
  if (!Number.isFinite(p) || p <= 0) return REGULATION_PERIOD_SECONDS;
  return p <= 4 ? REGULATION_PERIOD_SECONDS : OVERTIME_PERIOD_SECONDS;
}

export function getPeriodStartSeconds(period) {
  const p = Number(period);
  if (!Number.isFinite(p) || p <= 1) return 0;
  if (p <= 4) return (p - 1) * REGULATION_PERIOD_SECONDS;
  return REGULATION_SECONDS + (p - 5) * OVERTIME_PERIOD_SECONDS;
}

export function getGameTotalSeconds(numPeriods) {
  const count = Number(numPeriods);
  if (!Number.isFinite(count) || count <= 4) return REGULATION_SECONDS;
  return REGULATION_SECONDS + (count - 4) * OVERTIME_PERIOD_SECONDS;
}

export function getSecondsElapsed(period, clock) {
  const p = Number(period);
  if (!Number.isFinite(p) || p <= 0) return 0;
  const remaining = timeToSeconds(clock);
  if (p <= 4) {
    return (p - 1) * REGULATION_PERIOD_SECONDS + (REGULATION_PERIOD_SECONDS - remaining);
  }
  return REGULATION_SECONDS + (p - 5) * OVERTIME_PERIOD_SECONDS + (OVERTIME_PERIOD_SECONDS - remaining);
}
