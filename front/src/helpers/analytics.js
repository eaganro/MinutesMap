export const trackUmamiEvent = (eventName, data = {}) => {
  if (typeof window === 'undefined') return;
  if (!window?.umami?.track) return;
  window.umami.track(eventName, data);
};

export const trackPostHogEvent = (eventName, data = {}) => {
  if (typeof window === 'undefined') return;
  if (!window?.posthog?.capture) return;
  window.posthog.capture(eventName, data);
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
  trackUmamiEvent('feature-use', eventData);
  trackPostHogEvent('feature-use', eventData);
};
