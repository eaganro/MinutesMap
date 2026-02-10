/**
 * Compatibility layer for game selection utilities.
 * Canonical implementations now live in /domain/game-selection.
 */

export {
  MAX_AUTO_LOOKBACK_DAYS,
  GAME_NOT_STARTED_MESSAGE,
  isGameSlug,
  parseGameSlug,
  parseGameStatus,
  compareGamesForSelection,
  sortGamesForSelection,
  scheduleMatchesDate,
  findFirstStartedOrCompletedGame,
} from '../domain/game-selection/status';

export {
  formatDateString,
  getTodayString,
  getNbaTodayString,
  parseStartTimeEt,
  shiftDateString,
} from '../domain/game-selection/time';
