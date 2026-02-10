# Phase 2 Migration Note

Canonical paths after domain extraction:

- `front/src/components/hooks/useGameTimeline.js` composes domain modules.
- `front/src/domain/game-data/normalizePlayByPlay.js` owns payload shape detection and normalization.
- `front/src/domain/game-data/filterActions.js` owns stat-toggle filtering and action sorting.
- `front/src/domain/game-selection/status.js` owns schedule/game status parsing and selection ranking.
- `front/src/domain/game-selection/time.js` owns ET parsing and NBA-day/date utilities.
- `front/src/domain/events/classification.js` owns event parsing/classification.
- `front/src/ui/eventShapes.jsx` owns React SVG rendering helpers.

Compatibility layers retained to minimize churn:

- `front/src/helpers/gameSelectionUtils.js` re-exports from `domain/game-selection/*`.
- `front/src/helpers/eventStyles.jsx` re-exports from `domain/events/classification` and `ui/eventShapes.jsx`.
