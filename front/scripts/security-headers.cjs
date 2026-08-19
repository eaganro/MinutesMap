#!/usr/bin/env node

const REQUIRED_CSP_SOURCES = {
  'default-src': ["'self'"],
  'base-uri': ["'self'"],
  'object-src': ["'none'"],
  'frame-ancestors': ["'none'"],
  'form-action': ["'self'"],
  'script-src': ["'self'", 'https://analytics.minutesmap.com'],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'", 'https://analytics.minutesmap.com'],
  'worker-src': ["'none'"],
  'media-src': ["'none'"],
  'manifest-src': ["'self'"],
};

function normalizeHeaders(headers) {
  if (typeof headers?.entries === 'function') {
    return Object.fromEntries(
      [...headers.entries()].map(([name, value]) => [name.toLowerCase(), value]),
    );
  }

  return Object.fromEntries(
    Object.entries(headers || {}).map(([name, value]) => [name.toLowerCase(), String(value)]),
  );
}

function parseCsp(value) {
  return new Map(
    value
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [directive, ...sources] = part.split(/\s+/);
        return [directive, new Set(sources)];
      }),
  );
}

function validateSecurityHeaders(inputHeaders) {
  const headers = normalizeHeaders(inputHeaders);
  const errors = [];
  const cspValue = headers['content-security-policy'];

  if (!cspValue) {
    errors.push('Content-Security-Policy is missing');
  } else {
    const directives = parseCsp(cspValue);

    for (const [directive, expectedSources] of Object.entries(REQUIRED_CSP_SOURCES)) {
      const actualSources = directives.get(directive);
      if (!actualSources) {
        errors.push(`CSP is missing ${directive}`);
        continue;
      }

      for (const source of expectedSources) {
        if (!actualSources.has(source)) {
          errors.push(`CSP ${directive} is missing ${source}`);
        }
      }
    }

    if (!directives.has('upgrade-insecure-requests')) {
      errors.push('CSP is missing upgrade-insecure-requests');
    }
    if (cspValue.includes("'unsafe-eval'")) {
      errors.push("CSP must not allow 'unsafe-eval'");
    }
    if (directives.get('script-src')?.has("'unsafe-inline'")) {
      errors.push("CSP script-src must not allow 'unsafe-inline'");
    }
    if (directives.get('connect-src')?.has('wss:')) {
      errors.push('CSP connect-src must not allow every secure WebSocket origin');
    }
    if (
      ![...(directives.get('connect-src') || [])].some((source) =>
        /^wss:\/\/[a-z0-9]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com$/.test(source),
      )
    ) {
      errors.push('CSP connect-src is missing the API Gateway WebSocket origin');
    }
  }

  if (headers['x-content-type-options']?.toLowerCase() !== 'nosniff') {
    errors.push('X-Content-Type-Options must be nosniff');
  }
  if (headers['x-frame-options']?.toUpperCase() !== 'DENY') {
    errors.push('X-Frame-Options must be DENY');
  }
  if (headers['referrer-policy']?.toLowerCase() !== 'strict-origin-when-cross-origin') {
    errors.push('Referrer-Policy must be strict-origin-when-cross-origin');
  }

  const hsts = headers['strict-transport-security'] || '';
  const maxAge = Number(/(?:^|;)\s*max-age=(\d+)/i.exec(hsts)?.[1] || 0);
  if (maxAge < 63072000 || !/includeSubDomains/i.test(hsts) || !/(?:^|;)\s*preload/i.test(hsts)) {
    errors.push('Strict-Transport-Security must use two years, includeSubDomains, and preload');
  }

  const permissionsPolicy = headers['permissions-policy'] || '';
  for (const feature of ['camera=()', 'geolocation=()', 'microphone=()', 'payment=()']) {
    if (!permissionsPolicy.includes(feature)) {
      errors.push(`Permissions-Policy is missing ${feature}`);
    }
  }

  return errors;
}

async function checkUrl(url) {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:') {
    throw new Error(`${url} must use HTTPS`);
  }

  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }

  const errors = validateSecurityHeaders(response.headers);
  if (errors.length > 0) {
    throw new Error(`Security header check failed for ${response.url}:\n- ${errors.join('\n- ')}`);
  }

  process.stdout.write(`Security headers verified for ${response.url}\n`);
}

if (require.main === module) {
  const urls = process.argv.slice(2);
  if (urls.length === 0) {
    process.stderr.write('Usage: node scripts/security-headers.cjs <https-url> [https-url...]\n');
    process.exitCode = 1;
  } else {
    Promise.all(urls.map(checkUrl)).catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
  }
}

module.exports = { checkUrl, normalizeHeaders, parseCsp, validateSecurityHeaders };
