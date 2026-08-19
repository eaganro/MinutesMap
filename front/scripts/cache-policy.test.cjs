const assert = require('node:assert/strict');
const test = require('node:test');
const { CACHE_CLASSES, CACHE_CONTROL, classifyCache } = require('./cache-policy.cjs');
const { UPLOAD_ORDER, buildUploadArgs } = require('./deploy-static-site.cjs');

test('all root and nested HTML uses revalidation headers', () => {
  for (const relativePath of ['index.html', 'about/index.html', 'privacy/index.html']) {
    const cacheClass = classifyCache(relativePath);

    assert.equal(cacheClass, CACHE_CLASSES.HTML);
    assert.equal(CACHE_CONTROL[cacheClass], 'no-cache, no-store, must-revalidate');
  }
});

test('Vite content-hashed output uses long immutable caching', () => {
  for (const relativePath of [
    'js/index-k-OzTrrs.js',
    'js/chunks/vendor-a1B2c3D4.js',
    'css/style--cqs9v2j.css',
    'assets/font-A1_b2-C3.woff2',
  ]) {
    const cacheClass = classifyCache(relativePath);

    assert.equal(cacheClass, CACHE_CLASSES.IMMUTABLE);
    assert.equal(CACHE_CONTROL[cacheClass], 'public, max-age=31536000, immutable');
  }
});

test('stable assets use short revalidating caching', () => {
  for (const relativePath of [
    'static-pages/layout.css',
    'static-pages/theme-toggle.js',
    'theme-init.js',
    'logo-140.png',
    'assets/not-a-vite-hash.js',
  ]) {
    const cacheClass = classifyCache(relativePath);

    assert.equal(cacheClass, CACHE_CLASSES.STABLE);
    assert.equal(CACHE_CONTROL[cacheClass], 'public, max-age=0, must-revalidate');
  }
});

test('upload plan publishes dependencies before HTML', () => {
  assert.deepEqual(UPLOAD_ORDER, [
    CACHE_CLASSES.IMMUTABLE,
    CACHE_CLASSES.STABLE,
    CACHE_CLASSES.HTML,
  ]);
});

test('an upload step includes only its explicitly classified paths and headers', () => {
  const entries = [
    {
      relativePath: 'about/index.html',
      cacheControl: CACHE_CONTROL[CACHE_CLASSES.HTML],
    },
    {
      relativePath: 'privacy/index.html',
      cacheControl: CACHE_CONTROL[CACHE_CLASSES.HTML],
    },
  ];

  assert.deepEqual(buildUploadArgs('example-bucket', entries), [
    's3',
    'cp',
    require('node:path').resolve(__dirname, '..', 'dist'),
    's3://example-bucket',
    '--recursive',
    '--exclude',
    '*',
    '--include',
    'about/index.html',
    '--include',
    'privacy/index.html',
    '--cache-control',
    'no-cache, no-store, must-revalidate',
    '--only-show-errors',
    '--no-progress',
  ]);
});
