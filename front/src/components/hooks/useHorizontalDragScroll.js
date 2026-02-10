import { useCallback, useRef } from 'react';

const DEFAULT_DRAG_THRESHOLD_PX = 3;

export function useHorizontalDragScroll({
  draggingClassName = 'dragging',
  dragThresholdPx = DEFAULT_DRAG_THRESHOLD_PX,
} = {}) {
  const scrollRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const startXRef = useRef(0);
  const startScrollLeftRef = useRef(0);

  const setDraggingClass = useCallback(
    (isDragging) => {
      if (!scrollRef.current) {
        return;
      }
      scrollRef.current.classList.toggle(draggingClassName, isDragging);
    },
    [draggingClassName],
  );

  const startDrag = useCallback(
    (pageX) => {
      if (!scrollRef.current) {
        return;
      }
      isDraggingRef.current = true;
      dragMovedRef.current = false;
      startXRef.current = pageX - scrollRef.current.offsetLeft;
      startScrollLeftRef.current = scrollRef.current.scrollLeft;
      setDraggingClass(true);
    },
    [setDraggingClass],
  );

  const stopDrag = useCallback(() => {
    if (!scrollRef.current) {
      return;
    }
    isDraggingRef.current = false;
    setDraggingClass(false);
  }, [setDraggingClass]);

  const moveDrag = useCallback(
    (pageX) => {
      if (!isDraggingRef.current || !scrollRef.current) {
        return;
      }
      const x = pageX - scrollRef.current.offsetLeft;
      const walk = x - startXRef.current;
      if (Math.abs(walk) > dragThresholdPx) {
        dragMovedRef.current = true;
      }
      scrollRef.current.scrollLeft = startScrollLeftRef.current - walk;
    },
    [dragThresholdPx],
  );

  const onMouseDown = useCallback((e) => startDrag(e.pageX), [startDrag]);
  const onMouseLeave = stopDrag;
  const onMouseUp = stopDrag;
  const onMouseMove = useCallback(
    (e) => {
      if (!isDraggingRef.current || !scrollRef.current) {
        return;
      }
      e.preventDefault();
      moveDrag(e.pageX);
    },
    [moveDrag],
  );

  const onTouchStart = useCallback(
    (e) => {
      if (!e.touches[0]) {
        return;
      }
      startDrag(e.touches[0].pageX);
    },
    [startDrag],
  );
  const onTouchEnd = stopDrag;
  const onTouchCancel = stopDrag;
  const onTouchMove = useCallback(
    (e) => {
      if (!isDraggingRef.current || !scrollRef.current || !e.touches[0]) {
        return;
      }
      if (e.cancelable) {
        e.preventDefault();
      }
      moveDrag(e.touches[0].pageX);
    },
    [moveDrag],
  );

  const didDrag = useCallback(() => dragMovedRef.current, []);

  const scrollBy = useCallback((amount) => {
    if (!scrollRef.current) {
      return;
    }
    scrollRef.current.scrollLeft += amount;
  }, []);

  const resetScrollPosition = useCallback((position = 0) => {
    if (!scrollRef.current) {
      return;
    }
    scrollRef.current.scrollLeft = position;
  }, []);

  return {
    scrollRef,
    dragHandlers: {
      onMouseDown,
      onMouseLeave,
      onMouseUp,
      onMouseMove,
      onTouchStart,
      onTouchEnd,
      onTouchCancel,
      onTouchMove,
    },
    didDrag,
    scrollBy,
    resetScrollPosition,
  };
}
