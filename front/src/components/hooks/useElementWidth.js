import { useState, useEffect, useRef } from 'react';

/**
 * Hook for tracking an element's width using ResizeObserver.
 * Useful for responsive layouts that need to know container dimensions.
 * 
 * @returns {[React.RefObject, number]} A tuple of [ref to attach to element, current width]
 */
export function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    
    observer.observe(element);
    
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

