# Frontend Testing Guide

This guide defines where tests belong, how to name them, and what to run for targeted checks.

## Test Types

- Unit: pure functions and isolated hooks with mocked boundaries.
- Integration: hook or controller seams where multiple modules compose.
- E2E (Playwright): smoke user journeys that validate app wiring in a browser.

## File Placement

- Domain unit tests: `front/src/domain/**/<name>.test.js`
- Hook unit/integration tests: `front/src/components/hooks/<name>.test.js`
- Component behavior tests (focused): `front/src/components/**/<name>.test.jsx`
- Play export tests: `front/src/components/Play/PlayExport/*.test.js`
- E2E smoke tests: `front/e2e/*.spec.js`

## Naming Conventions

- Match source filename: `foo.js` -> `foo.test.js`
- Use behavior-driven test names:
  - `it('dedupes ws refreshes during cooldown')`
  - `it('preserves stale boxscore while loading')`
- Prefer explicit assertions over snapshots.

## Fixture Patterns

- Keep fixtures deterministic and small.
- Store reusable domain fixtures under source-adjacent fixture folders.
- Build edge-case fixtures intentionally:
  - null payloads
  - malformed clocks/status
  - missing optional fields
  - duplicate or tied action timestamps

## Mock Guidance

- Unit tests: mock network, websocket, analytics, and browser-only APIs.
- Integration tests: mock only true external boundaries; keep internal composition real.
- E2E: block analytics endpoints and wait on UI state, not arbitrary sleeps.

## Unit vs Integration vs E2E

- Unit:
  - parsing, normalization, sorting, classification
  - isolated hook behavior and state transitions
- Integration:
  - schedule + selected-game seam
  - live updates + gamepack/schedule refresh seam
  - export controller + render/transport seam
- E2E:
  - date change and URL sync
  - resume/live survival path
  - export preview option changes
  - dark mode persistence

## Test Impact Map

- `front/src/domain/game-selection/**`: date/status logic -> run domain unit tests.
- `front/src/domain/game-data/**`: play normalization/filtering -> run domain unit tests.
- `front/src/domain/events/**`: event classification -> run classification unit tests.
- `front/src/components/hooks/useScheduleState.js`: boot + schedule fetch -> run `useScheduleState.test.js`.
- `front/src/components/hooks/useSelectedGameState.js`: selected game metadata/stability -> run `useSelectedGameState.test.js`.
- `front/src/components/hooks/useLiveUpdates.js` and `useWebSocketGate.js`: ws gating and callbacks -> run `useLiveUpdates.test.js`, `useWebSocketGate.test.js`.
- `front/src/components/hooks/useResumeRefresh.js` and `useGamePackSync.js`: resume/cooldown/fetch dedupe -> run `useResumeRefresh.test.js`, `useGamePackSync.test.js`.
- `front/src/components/Play/PlayExport/**`: model/render/transport/controller -> run all `PlayExport/*.test.js`.
- `front/src/components/Score/Score.jsx`: stale-while-loading UI -> run `Score.test.jsx`.
- `front/src/components/Boxscore/Boxscore.jsx`: stale-while-loading/status fallback -> run `Boxscore.test.jsx`.
- `front/src/components/Schedule/Schedule.jsx`: date/drag-scroll interactions -> run `Schedule.test.jsx`.
- `front/src/components/Play/hooks/usePlayPointerHandlers.js`: lock/unlock and interaction branching -> run `usePlayPointerHandlers.test.js`.
- `front/e2e/*.spec.js`: top-level smoke flows -> run focused Playwright grep patterns first.

## Preferred Commands

- Test discovery: `npm --prefix front test -- --list`
- Unit suite: `npm --prefix front run test:unit`
- Unit with coverage report (informational): `npm --prefix front run test:unit:coverage`
- Focused e2e smoke: `npm --prefix front test -- e2e/app.spec.js --project=chromium -g "<pattern>"`
