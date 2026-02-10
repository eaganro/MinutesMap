export const FT_TOKEN = /\bft\b/i;
export const FREE_THROW_PATTERN = /\b(?:ft|free throw)\b\s*(\d+)\s*(?:of|\/)\s*(\d+)/i;
export const MISS_TOKEN = /\bmiss(?:ed|es)?\b/i;

const normalize = (value) => (value || '').toString().toLowerCase();
const hasMissToken = (value) => MISS_TOKEN.test((value || '').toString());

const isShotAction = (type, desc) =>
  type === '2pt' ||
  type === '3pt' ||
  type === 'freethrow' ||
  type === 'free throw' ||
  type.includes('shot') ||
  desc.includes('free throw') ||
  FT_TOKEN.test(desc);

export function getEventType(description, actionType = null, result = null) {
  const desc = normalize(description);
  const type = normalize(actionType);
  const res = normalize(result);

  const isMiss = res === 'x' || res === 'miss' || hasMissToken(desc) || type.includes('miss');
  const isShot = isShotAction(type, desc);

  if (isMiss) return 'miss';
  if (isShot) return 'point';
  if (type.includes('rebound') || desc.includes('reb')) return 'rebound';
  if (type.includes('assist') || desc.includes('assist')) return 'assist';
  if (type.includes('turnover') || desc.includes('turnover')) return 'turnover';
  if (type.includes('block') || desc.includes('block')) return 'block';
  if (type.includes('steal') || desc.includes('steal')) return 'steal';
  if (type.includes('foul') || desc.includes('foul')) return 'foul';

  return null;
}

export function isMissDescription(description) {
  return hasMissToken(description);
}

export function isFreeThrowAction(description, actionType = null) {
  const desc = normalize(description);
  const type = normalize(actionType);
  if (type.includes('foul')) return false;
  if (type === 'freethrow' || type.includes('free throw')) return true;
  return desc.includes('free throw') || FT_TOKEN.test(desc);
}

export function isThreePointAction(description, actionType = null) {
  const desc = normalize(description);
  const type = normalize(actionType);
  if (type === '3pt') return true;
  return desc.includes('3pt');
}

export function getFreeThrowAttempt(description, subType) {
  const text = `${subType || ''} ${description || ''}`;
  const match = text.match(FREE_THROW_PATTERN);
  if (!match) {
    return { attempt: 1, total: 1 };
  }
  return { attempt: Number(match[1]), total: Number(match[2]) };
}

export function getFreeThrowRingRatio(attempt, total) {
  if (total <= 1) return 0.8;
  if (attempt === 1) return 0.6;
  if (attempt === 2) return 0.8;
  return 1.1;
}
