#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SOFT_LINE_TARGET_PCT = 60;

const hasCoveragePlugin = (() => {
  try {
    require.resolve('@vitest/coverage-v8');
    return true;
  } catch (_error) {
    return false;
  }
})();

if (!hasCoveragePlugin) {
  console.warn(
    '[coverage] @vitest/coverage-v8 is not installed. Skipping unit coverage report (informational).',
  );
  process.exit(0);
}

const runResult = spawnSync(
  'npx',
  [
    'vitest',
    'run',
    '--coverage.enabled',
    'true',
    '--coverage.provider',
    'v8',
    '--coverage.reporter',
    'text',
    '--coverage.reporter',
    'json-summary',
  ],
  { stdio: 'inherit' },
);

if (runResult.status !== 0) {
  process.exit(runResult.status ?? 1);
}

const summaryPath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
if (!fs.existsSync(summaryPath)) {
  console.warn('[coverage] coverage-summary.json was not produced.');
  process.exit(0);
}

let summary = null;
try {
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
} catch (_error) {
  console.warn('[coverage] Failed to parse coverage-summary.json.');
  process.exit(0);
}

const linePct = summary?.total?.lines?.pct;
if (typeof linePct !== 'number') {
  console.warn('[coverage] Missing total line coverage in summary.');
  process.exit(0);
}

if (linePct < SOFT_LINE_TARGET_PCT) {
  console.warn(
    `[coverage] Warning: line coverage ${linePct.toFixed(1)}% is below soft target ${SOFT_LINE_TARGET_PCT}%.`,
  );
} else {
  console.log(
    `[coverage] Line coverage ${linePct.toFixed(1)}% (soft target ${SOFT_LINE_TARGET_PCT}%).`,
  );
}
