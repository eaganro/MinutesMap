import { getEventType, isFreeThrowAction } from './eventStyles.jsx';

const NBA_EVENT_BASE_URL = 'https://www.nba.com/stats/events';

const normalizeEventId = (actionNumber) => {
  if (actionNumber === null || actionNumber === undefined) return null;
  const raw = String(actionNumber).trim();
  if (!raw) return null;
  const match = raw.match(/\d+/);
  return match ? match[0] : null;
};

export function getSeasonLabelFromGameId(gameId) {
  if (!gameId) return null;
  const normalized = String(gameId).trim().padStart(10, '0');
  if (normalized.length < 5) return null;
  const seasonSuffix = normalized.slice(3, 5);
  const year = Number(seasonSuffix);
  if (!Number.isFinite(year)) return null;
  const startYear = 2000 + year;
  const endYear = startYear + 1;
  return `${startYear}-${String(endYear).slice(-2)}`;
}

export function buildNbaEventUrl({ gameId, actionNumber, description, season }) {
  const eventId = normalizeEventId(actionNumber);
  if (!gameId || !eventId) {
    return null;
  }

  const seasonLabel = season || getSeasonLabelFromGameId(gameId);
  if (!seasonLabel) return null;

  const params = new URLSearchParams({
    GameEventID: eventId,
    GameID: String(gameId).padStart(10, '0'),
    Season: seasonLabel,
    flag: '1',
    title: description || '',
  });

  return `${NBA_EVENT_BASE_URL}?${params.toString()}`;
}

export function resolveVideoAction(action, allActions) {
  if (!action) return null;
  const actions = allActions || [];
  const eventType = getEventType(action.description, action.actionType, action.result);
  const isFreeThrow = isFreeThrowAction(action.description, action.actionType);

  if (isFreeThrow) {
    const pointAction = actions.find((entry) =>
      entry.clock === action.clock
      && entry.period === action.period
      && getEventType(entry.description, entry.actionType, entry.result) === 'point'
    );
    if (pointAction) return pointAction;
  }

  if (eventType === 'block') {
    const missAction = actions.find((entry) =>
      entry.clock === action.clock
      && entry.period === action.period
      && getEventType(entry.description, entry.actionType, entry.result) === 'miss'
    );
    if (missAction) return missAction;
  }

  if (eventType === 'steal') {
    const turnoverAction = actions.find((entry) =>
      entry.clock === action.clock
      && entry.period === action.period
      && getEventType(entry.description, entry.actionType, entry.result) === 'turnover'
    );
    if (turnoverAction) return turnoverAction;
  }

  return action;
}
