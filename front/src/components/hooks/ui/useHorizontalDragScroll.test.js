import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useHorizontalDragScroll } from './useHorizontalDragScroll';

const buildRefNode = () => ({
  scrollLeft: 100,
  offsetLeft: 10,
  classList: {
    toggle: vi.fn(),
  },
});

describe('useHorizontalDragScroll', () => {
  it('updates scroll position and drag flag from mouse events', () => {
    const { result } = renderHook(() => useHorizontalDragScroll());
    const node = buildRefNode();
    result.current.scrollRef.current = node;

    act(() => {
      result.current.dragHandlers.onMouseDown({ pageX: 60 });
    });
    act(() => {
      result.current.dragHandlers.onMouseMove({
        pageX: 42,
        preventDefault: vi.fn(),
      });
    });

    expect(node.scrollLeft).toBe(118);
    expect(result.current.didDrag()).toBe(true);

    act(() => {
      result.current.dragHandlers.onMouseUp();
    });

    expect(node.classList.toggle).toHaveBeenCalledWith('dragging', true);
    expect(node.classList.toggle).toHaveBeenCalledWith('dragging', false);
  });

  it('supports imperative scroll controls', () => {
    const { result } = renderHook(() => useHorizontalDragScroll());
    const node = buildRefNode();
    result.current.scrollRef.current = node;

    act(() => {
      result.current.scrollBy(40);
    });
    expect(node.scrollLeft).toBe(140);

    act(() => {
      result.current.resetScrollPosition();
    });
    expect(node.scrollLeft).toBe(0);
  });
});
