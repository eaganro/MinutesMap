#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { CACHE_CLASSES, buildCacheManifest, validateCacheManifest } = require('./cache-policy.cjs');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const UPLOAD_ORDER = [CACHE_CLASSES.IMMUTABLE, CACHE_CLASSES.STABLE, CACHE_CLASSES.HTML];

function buildUploadArgs(bucket, entries) {
  const commandArgs = ['s3', 'cp', distDir, `s3://${bucket}`, '--recursive', '--exclude', '*'];

  for (const entry of entries) {
    commandArgs.push('--include', entry.relativePath);
  }

  commandArgs.push(
    '--cache-control',
    entries[0].cacheControl,
    '--only-show-errors',
    '--no-progress',
  );

  return commandArgs;
}

function uploadClass(bucket, manifest, cacheClass) {
  const entries = manifest.filter((entry) => entry.cacheClass === cacheClass);

  if (entries.length === 0) {
    return;
  }

  process.stdout.write(`Uploading ${entries.length} ${cacheClass} artifacts.\n`);
  const result = spawnSync('aws', buildUploadArgs(bucket, entries), { stdio: 'inherit' });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  const args = process.argv.slice(2);
  const shouldUpload = args.includes('--upload');
  const bucketFlagIndex = args.indexOf('--bucket');
  const bucket = bucketFlagIndex === -1 ? null : args[bucketFlagIndex + 1];

  if (!fs.existsSync(distDir)) {
    throw new Error(`Build output does not exist: ${distDir}`);
  }

  const manifest = buildCacheManifest(distDir);
  validateCacheManifest(manifest);

  const counts = Object.fromEntries(
    Object.values(CACHE_CLASSES).map((cacheClass) => [
      cacheClass,
      manifest.filter((entry) => entry.cacheClass === cacheClass).length,
    ]),
  );

  process.stdout.write(
    `Verified ${manifest.length} build artifacts: ${counts.immutable} immutable, ` +
      `${counts.stable} stable, ${counts.html} HTML.\n`,
  );

  if (!shouldUpload) {
    return;
  }

  if (!bucket || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error('Pass a valid S3 bucket name with --bucket');
  }

  // Publish every dependency before HTML so a new document never references a
  // missing asset. Retain old hashed assets for clients with cached older HTML.
  for (const cacheClass of UPLOAD_ORDER) {
    uploadClass(bucket, manifest, cacheClass);
  }
}

if (require.main === module) {
  main();
}

module.exports = { UPLOAD_ORDER, buildUploadArgs };
