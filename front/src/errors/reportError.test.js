import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportError } from './reportError';

afterEach(() => {
  delete window.posthog;
});

describe('reportError', () => {
  it('sends errors and structured context to PostHog exception capture', () => {
    const captureException = vi.fn();
    window.posthog = { captureException };
    const error = new Error('offline');

    reportError(error, { boundary: 'data-fetch', resource: 'schedule' });

    expect(captureException).toHaveBeenCalledWith(error, {
      boundary: 'data-fetch',
      resource: 'schedule',
    });
  });

  it('falls back to a structured event when exception capture is unavailable', () => {
    const capture = vi.fn();
    window.posthog = { capture };

    reportError('render failed', { boundary: 'root-render' });

    expect(capture).toHaveBeenCalledWith('application_error', {
      error_name: 'Error',
      error_message: 'render failed',
      boundary: 'root-render',
    });
  });
});
