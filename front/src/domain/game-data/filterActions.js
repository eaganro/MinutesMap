import { isMissDescription } from '../events/classification';
import { timeToSeconds } from '../../helpers/utils';

export const STAT_TOGGLE_INDEX = Object.freeze({
  MAKE: 0,
  MISS: 1,
  REBOUND: 2,
  ASSIST: 3,
  TURNOVER: 4,
  BLOCK: 5,
  STEAL: 6,
  FOUL: 7,
});

const normalize = (value) => (value || '').toString().toLowerCase();

const isShotType = (actionType, description) =>
  actionType === '2pt' ||
  actionType === '3pt' ||
  actionType === 'freethrow' ||
  actionType === 'free throw' ||
  actionType.includes('shot') ||
  description.includes('free throw');

export function getActionStatToggleIndex(action) {
  const type = normalize(action?.actionType);
  const desc = normalize(action?.description);
  const result = normalize(action?.result || action?.r);

  const shotType = isShotType(type, desc);
  const isMiss =
    result === 'x' || result === 'miss' || type.includes('miss') || isMissDescription(desc);
  const isMake = result === 'm' || result === 'make' || (shotType && !isMiss);

  if (shotType && isMake) return STAT_TOGGLE_INDEX.MAKE;
  if (shotType && isMiss) return STAT_TOGGLE_INDEX.MISS;
  if (type.includes('rebound')) return STAT_TOGGLE_INDEX.REBOUND;
  if (type.includes('assist')) return STAT_TOGGLE_INDEX.ASSIST;
  if (type.includes('turnover')) return STAT_TOGGLE_INDEX.TURNOVER;
  if (type.includes('block')) return STAT_TOGGLE_INDEX.BLOCK;
  if (type.includes('steal')) return STAT_TOGGLE_INDEX.STEAL;
  if (type.includes('foul')) return STAT_TOGGLE_INDEX.FOUL;
  return null;
}

export function filterActions(action, statOn) {
  const statIndex = getActionStatToggleIndex(action);
  return statIndex !== null && Boolean(statOn[statIndex]);
}

export function filterPlayerActions(playerMap, statOn) {
  if (!playerMap || typeof playerMap !== 'object') return {};
  return Object.fromEntries(
    Object.entries(playerMap).map(([name, actions]) => [
      name,
      (actions || []).filter((action) => filterActions(action, statOn)),
    ]),
  );
}

export function sortActions(actions) {
  return (actions || []).slice().sort((a, b) => {
    if (a.period < b.period) return -1;
    if (a.period > b.period) return 1;
    if (timeToSeconds(a.clock) > timeToSeconds(b.clock)) return -1;
    return 1;
  });
}
