const assert = require('node:assert/strict');
const test = require('node:test');
const { validateSecurityHeaders } = require('./security-headers.cjs');

const representativeResponseHeaders = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' https://analytics.minutesmap.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://analytics.minutesmap.com wss://abc123.execute-api.us-east-1.amazonaws.com",
    "worker-src 'none'",
    "media-src 'none'",
    "manifest-src 'self'",
    'upgrade-insecure-requests',
  ].join('; '),
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), microphone=(), payment=(), fullscreen=(self)',
};

test('accepts the representative CloudFront frontend response headers', () => {
  assert.deepEqual(validateSecurityHeaders(representativeResponseHeaders), []);
});

test('rejects unsafe script execution and an unrestricted WebSocket source', () => {
  const headers = {
    ...representativeResponseHeaders,
    'Content-Security-Policy': representativeResponseHeaders['Content-Security-Policy']
      .replace("script-src 'self'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'")
      .replace('wss://abc123.execute-api.us-east-1.amazonaws.com', 'wss:'),
  };

  assert.deepEqual(validateSecurityHeaders(headers), [
    "CSP must not allow 'unsafe-eval'",
    "CSP script-src must not allow 'unsafe-inline'",
    'CSP connect-src must not allow every secure WebSocket origin',
    'CSP connect-src is missing the API Gateway WebSocket origin',
  ]);
});

test('reports missing defense-in-depth headers', () => {
  const headers = { ...representativeResponseHeaders };
  delete headers['X-Frame-Options'];
  delete headers['Permissions-Policy'];

  assert.deepEqual(validateSecurityHeaders(headers), [
    'X-Frame-Options must be DENY',
    'Permissions-Policy is missing camera=()',
    'Permissions-Policy is missing geolocation=()',
    'Permissions-Policy is missing microphone=()',
    'Permissions-Policy is missing payment=()',
  ]);
});
