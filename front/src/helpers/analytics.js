// PostHog is loaded only after the page has drawn (see startAnalytics), so it stays out of the
// download that first-time visitors wait for. Calls made before then are kept and replayed,
// with their original time, once it has loaded.
const MAX_PENDING_CALLS = 100;

let analyticsConfig = null;
let pendingCalls = null;
let loadPromise = null;

/** Sets up PostHog for this page; nothing loads until startAnalytics(). */
export function configureAnalytics({ key, host }) {
  if (!key || analyticsConfig) return;
  analyticsConfig = { key, host };
  pendingCalls = [];
}

/** Loads and starts PostHog, once. Safe to call repeatedly and when it isn't configured. */
export function startAnalytics() {
  if (!analyticsConfig || loadPromise || typeof window === 'undefined') return loadPromise;
  loadPromise = import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(analyticsConfig.key, {
        api_host: analyticsConfig.host,
        capture_pageview: false,
        persistence: 'localStorage',
      });
      window.posthog = posthog;
      posthog.startSessionRecording(true);
      const calls = pendingCalls || [];
      pendingCalls = null;
      calls.forEach(({ callback, queuedAt }) => {
        try {
          callback(posthog, queuedAt);
        } catch {
          // A failed replay must not stop the rest.
        }
      });
    })
    .catch(() => {
      // Blocked or offline: analytics stays off for this page.
      pendingCalls = null;
    });
  return loadPromise;
}

/**
 * Runs `callback(posthog, queuedAt)` now if PostHog is ready, or once it has loaded (with the
 * time it was asked for). Does nothing when analytics isn't set up.
 */
export function withPostHog(callback) {
  if (typeof window === 'undefined') return;
  if (window.posthog) {
    callback(window.posthog);
    return;
  }
  if (pendingCalls && pendingCalls.length < MAX_PENDING_CALLS) {
    pendingCalls.push({ callback, queuedAt: new Date() });
  }
}

export const trackPostHogEvent = (eventName, data = {}) => {
  withPostHog((posthog, queuedAt) => {
    if (typeof posthog.capture !== 'function') return;
    if (queuedAt) {
      posthog.capture(eventName, data, { timestamp: queuedAt });
    } else {
      posthog.capture(eventName, data);
    }
  });
};

export const trackPostHogPageView = (data = {}) => {
  if (typeof window === 'undefined') return;
  trackPostHogEvent('$pageview', {
    $current_url: window.location.href,
    url: `${window.location.pathname}${window.location.search}`,
    title: document.title,
    ...data,
  });
};

export const trackFeatureUse = (feature, data = {}) => {
  if (!feature) return;
  const eventData = { feature, ...data };
  trackPostHogEvent('feature-use', eventData);
};

// For tests only.
export function resetAnalyticsForTests() {
  analyticsConfig = null;
  pendingCalls = null;
  loadPromise = null;
}
