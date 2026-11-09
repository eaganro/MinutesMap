import { withPostHog } from '../helpers/analytics';

function normalizeError(errorLike) {
  if (errorLike instanceof Error) {
    return errorLike;
  }

  if (typeof errorLike === 'string') {
    return new Error(errorLike);
  }

  return new Error('Unexpected application error.');
}

// Errors from before PostHog has loaded are sent once it has (see helpers/analytics).
export function reportError(errorLike, context = {}) {
  if (typeof window === 'undefined') return;

  const error = normalizeError(errorLike);
  withPostHog((posthog) => {
    try {
      if (typeof posthog.captureException === 'function') {
        posthog.captureException(error, context);
        return;
      }

      if (typeof posthog.capture === 'function') {
        posthog.capture('application_error', {
          error_name: error.name,
          error_message: error.message,
          ...context,
        });
      }
    } catch {
      // Error reporting must never interrupt application recovery.
    }
  });
}
