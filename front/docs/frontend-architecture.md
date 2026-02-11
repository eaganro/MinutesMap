# Frontend Architecture Notes

## Data Layer (`front/src/data`)
- `apiClient.js`: fetch wrapper and status classification (`success`, `not-available`, error classes).
- `gamepackAdapter.js`: gamepack payload shape detection and normalization (`box`/`flow`, `v2`, `schemaVersion=1`).
- `scheduleAdapter.js`: schedule list normalization and `init.json` state normalization.

These modules are pure or near-pure and are the only place where payload-shape coercion should happen.

## Hook Layer (`front/src/components/hooks`)
- `useGameData`: orchestrates game/schedule loading state and delegates payload normalization to adapters.
- `useScheduleState`: owns selected date/bootstrap behavior and delegates init payload handling to adapters.
- `useGamePackSync`: coordinates schedule/gamepack fetch timing and dedupe behavior.

Hooks should focus on UI state transitions, not raw payload-shape branching.

## Style Tokens
- Shared layout tokens are defined in `front/src/styles/_layoutTokens.scss`.
- Runtime CSS custom properties are exposed from `front/src/theme.scss`.
- Component SCSS should use layout tokens (via CSS vars or shared Sass variables) instead of repeating hardcoded widths/padding/breakpoints.
