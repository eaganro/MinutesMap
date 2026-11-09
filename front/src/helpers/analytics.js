import { readStoredValue, writeStoredValue } from '../components/hooks/state/storage';

// PostHog is loaded only after the page has drawn (see startAnalytics), so it stays out of the
// download that first-time visitors wait for. Calls made before then are kept and replayed,
// with their original time, once it has loaded.
const MAX_PENDING_CALLS = 100;

// A browser can turn session recordings off for itself (its events still go to PostHog) by
// opening the site once with ?recording=off, and back on with ?recording=on; used for the
// owner's own devices. The parameter is removed from the address at once, so a copied link
// never turns recordings off for someone else.
const RECORDING_PARAM = 'recording';
const RECORDING_OFF_STORAGE_KEY = 'recordingOff';
const RECORDING_OFF_OPTIONS = { validate: (value) => typeof value === 'boolean' };

function isRecordingTurnedOff() {
  if (typeof window === 'undefined') return false;
  const url = new URL(window.location.href);
  const requested = url.searchParams.get(RECORDING_PARAM);
  if (requested === 'off' || requested === 'on') {
    writeStoredValue(RECORDING_OFF_STORAGE_KEY, requested === 'off');
    url.searchParams.delete(RECORDING_PARAM);
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  }
  return readStoredValue(RECORDING_OFF_STORAGE_KEY, false, RECORDING_OFF_OPTIONS) === true;
}

let analyticsConfig = null;
let pendingCalls = null;
let loadPromise = null;

/** Sets up PostHog for this page; nothing loads until startAnalytics(). */
export function configureAnalytics({ key, host }) {
  const isRecordingOff = isRecordingTurnedOff();
  if (!key || analyticsConfig) return;
  analyticsConfig = { key, host, isRecordingOff };
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
        ...(analyticsConfig.isRecordingOff ? { disable_session_recording: true } : {}),
      });
      window.posthog = posthog;
      if (!analyticsConfig.isRecordingOff) posthog.startSessionRecording(true);
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
