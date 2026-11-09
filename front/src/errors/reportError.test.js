import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportError } from './reportError';
import { configureAnalytics, resetAnalyticsForTests, startAnalytics } from '../helpers/analytics';

const mocks = vi.hoisted(() => ({
  posthog: { init: vi.fn(), captureException: vi.fn(), startSessionRecording: vi.fn() },
}));

vi.mock('posthog-js', () => ({ default: mocks.posthog }));

afterEach(() => {
  delete window.posthog;
  resetAnalyticsForTests();
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

  it('sends errors from before PostHog has loaded once it has', async () => {
    configureAnalytics({ key: 'phc_test', host: '/ph' });
    const error = new Error('early');

    reportError(error, { boundary: 'react-recoverable' });
    expect(mocks.posthog.captureException).not.toHaveBeenCalled();

    await startAnalytics();
    expect(mocks.posthog.captureException).toHaveBeenCalledWith(error, {
      boundary: 'react-recoverable',
    });
  });
});
