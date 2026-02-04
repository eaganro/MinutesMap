export const trackUmamiEvent = (eventName, data = {}) => {
  if (typeof window === 'undefined') return;
  if (!window?.umami?.track) return;
  window.umami.track(eventName, data);
};

export const trackFeatureUse = (feature, data = {}) => {
  if (!feature) return;
  trackUmamiEvent('feature-use', { feature, ...data });
};
