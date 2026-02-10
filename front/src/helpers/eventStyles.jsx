/**
 * Compatibility layer for event classification + rendering helpers.
 * Canonical modules:
 * - domain logic: /domain/events/classification
 * - UI rendering: /ui/eventShapes
 */

export {
  FT_TOKEN,
  FREE_THROW_PATTERN,
  MISS_TOKEN,
  getEventType,
  isMissDescription,
  isFreeThrowAction,
  isThreePointAction,
  getFreeThrowAttempt,
  getFreeThrowRingRatio,
} from '../domain/events/classification';

export {
  EVENT_TYPES,
  renderEventShape,
  renderFreeThrowRing,
  LegendShape,
} from '../ui/eventShapes.jsx';
