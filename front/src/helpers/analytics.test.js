import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackFeatureUse, trackPostHogPageView } from './analytics';

afterEach(() => {
  vi.restoreAllMocks();
  delete window.umami;
  delete window.posthog;
});

describe('analytics helpers', () => {
  it('tracks feature use in configured analytics providers', () => {
    const umamiTrack = vi.fn();
    const posthogCapture = vi.fn();
    window.umami = { track: umamiTrack };
    window.posthog = { capture: posthogCapture };

    trackFeatureUse('lineups', { source: 'tap' });

    const eventData = { feature: 'lineups', source: 'tap' };
    expect(umamiTrack).toHaveBeenCalledWith('feature-use', eventData);
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
});
