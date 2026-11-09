import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureAnalytics,
  resetAnalyticsForTests,
  startAnalytics,
  trackFeatureUse,
  trackPostHogPageView,
} from './analytics';

const mocks = vi.hoisted(() => ({
  posthog: {
    init: vi.fn(),
    capture: vi.fn(),
    startSessionRecording: vi.fn(),
  },
}));

vi.mock('posthog-js', () => ({ default: mocks.posthog }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  delete window.posthog;
  resetAnalyticsForTests();
});

describe('analytics helpers', () => {
  it('tracks feature use in PostHog', () => {
    const posthogCapture = vi.fn();
    window.posthog = { capture: posthogCapture };

    trackFeatureUse('lineups', { source: 'tap' });

    const eventData = { feature: 'lineups', source: 'tap' };
    expect(posthogCapture).toHaveBeenCalledWith('feature-use', eventData);
  });

  it('tracks PostHog page views with the current URL', () => {
    const posthogCapture = vi.fn();
    window.posthog = { capture: posthogCapture };

    trackPostHogPageView({ gameId: '2026-02-03-phi-gsw' });

    expect(posthogCapture).toHaveBeenCalledWith(
      '$pageview',
      expect.objectContaining({
        $current_url: window.location.href,
        url: `${window.location.pathname}${window.location.search}`,
        title: document.title,
        gameId: '2026-02-03-phi-gsw',
      }),
    );
  });

  it('keeps events from before PostHog loads and sends them, with their time, once it has', async () => {
    configureAnalytics({ key: 'phc_test', host: '/ph' });
    trackFeatureUse('lineups');
    expect(window.posthog).toBeUndefined();

    await startAnalytics();

    expect(mocks.posthog.init).toHaveBeenCalledWith('phc_test', {
      api_host: '/ph',
      capture_pageview: false,
      persistence: 'localStorage',
    });
    expect(mocks.posthog.startSessionRecording).toHaveBeenCalledWith(true);
    expect(window.posthog).toBe(mocks.posthog);
    expect(mocks.posthog.capture).toHaveBeenCalledWith(
      'feature-use',
      { feature: 'lineups' },
      { timestamp: expect.any(Date) },
    );

    // After loading, events go straight through.
    trackFeatureUse('boxscore');
    expect(mocks.posthog.capture).toHaveBeenLastCalledWith('feature-use', { feature: 'boxscore' });
  });

  it('loads PostHog only once, and not at all without a key', async () => {
    await startAnalytics();
    expect(mocks.posthog.init).not.toHaveBeenCalled();

    configureAnalytics({ key: 'phc_test', host: '/ph' });
    await Promise.all([startAnalytics(), startAnalytics()]);
    expect(mocks.posthog.init).toHaveBeenCalledTimes(1);
  });
});
