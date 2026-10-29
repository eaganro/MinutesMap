import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

const withRetryParam = (src, attempt) =>
  attempt > 0 ? `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}` : src;

/**
 * Tracks whether an <img> has loaded, keyed by its URL rather than a flag that has to be
 * reset when the URL changes, so an image whose URL stays the same never drops back to
 * "loading". A failed load is retried a couple of times before giving up.
 *
 * Spread the returned `imgProps` onto the <img>.
 */
export function useLoadedImage(src) {
  const imgRef = useRef(null);
  const [loadedSrc, setLoadedSrc] = useState(null);
  const [failedSrc, setFailedSrc] = useState(null);
  const [retry, setRetry] = useState({ src: null, attempt: 0 });

  const attempt = retry.src === src ? retry.attempt : 0;
  const currentSrc = src ? withRetryParam(src, attempt) : src;

  // An image can finish loading (e.g. from cache) before React attaches onLoad.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      setLoadedSrc(img.getAttribute('src'));
    }
  }, [currentSrc]);

  useEffect(() => {
    if (!currentSrc || failedSrc !== currentSrc || attempt >= MAX_RETRIES) return undefined;
    const timer = setTimeout(() => setRetry({ src, attempt: attempt + 1 }), RETRY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [attempt, currentSrc, failedSrc, src]);

  const onLoad = useCallback((event) => {
    setLoadedSrc(event.currentTarget.getAttribute('src'));
  }, []);

  const onError = useCallback((event) => {
    setFailedSrc(event.currentTarget.getAttribute('src'));
  }, []);

  return {
    isLoaded: Boolean(currentSrc) && loadedSrc === currentSrc,
    imgProps: { ref: imgRef, src: currentSrc, onLoad, onError },
  };
}
