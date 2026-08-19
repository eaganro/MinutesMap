const fs = require('node:fs');
const path = require('node:path');

const CACHE_CLASSES = {
  HTML: 'html',
  IMMUTABLE: 'immutable',
  STABLE: 'stable',
};

const CACHE_CONTROL = {
  [CACHE_CLASSES.HTML]: 'no-cache, no-store, must-revalidate',
  [CACHE_CLASSES.IMMUTABLE]: 'public, max-age=31536000, immutable',
  [CACHE_CLASSES.STABLE]: 'public, max-age=0, must-revalidate',
};

// Vite emits generated files into these directories using [name]-[hash].
// Public/static files retain their original paths and therefore never match.
const CONTENT_HASHED_ASSET = /^(?:assets|css|js)\/(?:.*\/)?[^/]+-[A-Za-z0-9_-]{8}\.[^/]+$/;

function normalizeRelativePath(filePath) {
  return filePath.split(path.sep).join('/').replace(/^\.\//, '');
}

function classifyCache(filePath) {
  const relativePath = normalizeRelativePath(filePath);

  if (relativePath.toLowerCase().endsWith('.html')) {
    return CACHE_CLASSES.HTML;
  }

  if (CONTENT_HASHED_ASSET.test(relativePath)) {
    return CACHE_CLASSES.IMMUTABLE;
  }

  return CACHE_CLASSES.STABLE;
}

function listFiles(rootDir, currentDir = rootDir) {
  return fs.readdirSync(currentDir, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      return listFiles(rootDir, absolutePath);
    }

    return [normalizeRelativePath(path.relative(rootDir, absolutePath))];
  });
}

function buildCacheManifest(distDir) {
  return listFiles(distDir)
    .sort()
    .map((relativePath) => ({
      relativePath,
      cacheClass: classifyCache(relativePath),
      cacheControl: CACHE_CONTROL[classifyCache(relativePath)],
    }));
}

function validateCacheManifest(manifest) {
  const byPath = new Map(manifest.map((entry) => [entry.relativePath, entry]));
  const expected = {
    'index.html': CACHE_CLASSES.HTML,
    'about/index.html': CACHE_CLASSES.HTML,
    'privacy/index.html': CACHE_CLASSES.HTML,
    'static-pages/layout.css': CACHE_CLASSES.STABLE,
    'static-pages/theme-toggle.js': CACHE_CLASSES.STABLE,
  };

  for (const [relativePath, cacheClass] of Object.entries(expected)) {
    const entry = byPath.get(relativePath);

    if (!entry) {
      throw new Error(`Expected build artifact is missing: ${relativePath}`);
    }

    if (entry.cacheClass !== cacheClass) {
      throw new Error(
        `Expected ${relativePath} to use ${cacheClass} caching, got ${entry.cacheClass}`,
      );
    }
  }

  if (!manifest.some((entry) => entry.cacheClass === CACHE_CLASSES.IMMUTABLE)) {
    throw new Error('Build did not produce any content-hashed assets');
  }

  for (const entry of manifest) {
    const expectedClass = classifyCache(entry.relativePath);
    const expectedControl = CACHE_CONTROL[expectedClass];

    if (entry.cacheClass !== expectedClass || entry.cacheControl !== expectedControl) {
      throw new Error(`Invalid cache metadata for ${entry.relativePath}`);
    }
  }
}

module.exports = {
  CACHE_CLASSES,
  CACHE_CONTROL,
  buildCacheManifest,
  classifyCache,
  validateCacheManifest,
};
