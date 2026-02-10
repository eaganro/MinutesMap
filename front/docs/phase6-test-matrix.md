# Phase 6 Test Matrix

## Coverage Matrix

| Module / Seam | Risk | Failure Impact | Test Type | Required Scenarios |
| --- | --- | --- | --- | --- |
| `src/domain/game-selection/time.js` | High | Wrong date/game selection around ET boundary | Unit | NBA-day boundary, ET parsing, malformed timestamps |
| `src/domain/game-selection/status.js` | High | Wrong game ordering/selection/live-final gating | Unit | slug parsing, status classification, schedule-date match, sorting tie behavior |
| `src/domain/game-data/normalizePlayByPlay.js` | High | Broken timeline rendering/export inputs | Unit | legacy vs compact payload, null/malformed branches, missing fields |
| `src/domain/events/classification.js` | Medium | Incorrect event icons/filtering/tooltip meaning | Unit | miss detection, free throw parsing, 3PT rules |
| `src/components/hooks/useScheduleState.js` | High | wrong initial date/game and schedule fetch orchestration | Unit + Integration | init bootstrap, date change API, auto-select behavior |
| `src/components/hooks/useSelectedGameState.js` | High | stale/incorrect selected game across loading transitions | Unit + Integration | stable metadata during schedule gaps, final/upcoming state resolution |
| `src/components/hooks/useGamePackSync.js` | High | duplicate fetches or missed refreshes | Unit | dedupe by game transition, schedule-loading gate, reason tracking |
| `src/components/hooks/useLiveUpdates.js` + `useWebSocketGate.js` | High | websocket over/under-subscription and missed updates | Unit + Integration | enable/disable gating, date/game follow logic, ws callback routing |
| `src/components/hooks/useResumeRefresh.js` | High | stale data after tab resume/reconnect | Unit | cooldown thresholds, visibility/focus gating, cleanup |
| `src/components/Play/PlayExport/*` | High | failed preview/share/download or bad payloads | Unit + Integration | controller state transitions, filename/model output, share fallback, file/url failure handling |
| `src/components/Score/Score.jsx` | Medium | flicker/regression during loading refresh | Component | stable-while-loading display and loading overlay behavior |
| `src/components/Boxscore/Boxscore.jsx` | Medium | stale/empty boxscore states regressions | Component | stable-while-loading, status-message fallback |
| `src/components/Schedule/Schedule.jsx` | Medium | date navigation or drag-click interaction regressions | Component | date input/buttons, drag suppression, scroll controls |
| `e2e/app.spec.js` smoke flows | High | end-to-end production regressions missed | E2E | date+URL sync, refresh/resume survival, export preview option changes, dark-mode persistence |

## Frozen Minimum Scenarios (Phase 6)

1. Date changes update both UI value and URL contract.
2. Selected game metadata remains stable while schedule reloads.
3. Websocket is disabled for finalized/non-current NBA-day contexts.
4. Resume refresh respects cooldowns and visibility guards.
5. Export preview generation handles renderer and transport branch failures.
6. Export share branch handles `canShare=true` and fallback download path.
7. Score and Boxscore keep last stable data visible during short loading windows.
8. Schedule drag interaction does not trigger unintended game selection click.
9. Dark mode preference persists across reload.
