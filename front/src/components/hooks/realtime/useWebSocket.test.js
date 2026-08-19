import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWebSocket } from './useWebSocket';

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.send = vi.fn();
    this.close = vi.fn(() => {
      this.readyState = MockWebSocket.CLOSING;
    });
    MockWebSocket.instances.push(this);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  serverClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  error() {
    this.onerror?.();
  }
}

const defaultProps = {
  gameId: '2026-02-03-phi-gsw',
  date: '2026-02-03',
  onPlayByPlayUpdate: vi.fn(),
  onDateUpdate: vi.fn(),
};

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.stubGlobal('WebSocket', MockWebSocket);
    MockWebSocket.instances = [];
    defaultProps.onPlayByPlayUpdate.mockReset();
    defaultProps.onDateUpdate.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens and sends the current subscriptions', () => {
    const { result } = renderHook(() => useWebSocket(defaultProps));
    const socket = MockWebSocket.instances[0];

    act(() => socket.open());

    expect(result.current.ws).toBe(socket);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ action: 'followDate', date: defaultProps.date }),
    );
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ action: 'followGame', gameId: defaultProps.gameId }),
    );
  });

  it('closes a connecting socket exactly once on unmount and ignores late events', () => {
    const { unmount } = renderHook(() => useWebSocket(defaultProps));
    const socket = MockWebSocket.instances[0];
    const lateMessage = socket.onmessage;
    const lateClose = socket.onclose;

    unmount();

    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(socket.onopen).toBeNull();
    expect(socket.onmessage).toBeNull();
    expect(socket.onclose).toBeNull();
    expect(socket.onerror).toBeNull();

    act(() => {
      lateMessage({ data: JSON.stringify({ type: 'date_update', date: defaultProps.date }) });
      lateClose();
      vi.runAllTimers();
    });

    expect(defaultProps.onDateUpdate).not.toHaveBeenCalled();
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('stays disconnected while disabled and creates a fresh socket when re-enabled', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useWebSocket({ ...defaultProps, enabled }),
      { initialProps: { enabled: false } },
    );

    expect(result.current.ws).toBeNull();
    expect(MockWebSocket.instances).toHaveLength(0);

    rerender({ enabled: true });
    const firstSocket = MockWebSocket.instances[0];
    act(() => firstSocket.open());

    rerender({ enabled: false });
    expect(firstSocket.close).toHaveBeenCalledTimes(1);
    expect(result.current.ws).toBeNull();

    rerender({ enabled: true });
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.instances[1]).not.toBe(firstSocket);
  });

  it('reconnects after an error closes the active socket', () => {
    renderHook(() => useWebSocket(defaultProps));
    const socket = MockWebSocket.instances[0];

    act(() => {
      socket.error();
      socket.serverClose();
      vi.advanceTimersByTime(1000);
    });

    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('keeps close permanent until connect is called', () => {
    const { result } = renderHook(() => useWebSocket(defaultProps));
    const socket = MockWebSocket.instances[0];

    act(() => result.current.close());
    act(() => vi.runAllTimers());

    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(result.current.ws).toBeNull();
    expect(MockWebSocket.instances).toHaveLength(1);

    act(() => result.current.connect());

    expect(MockWebSocket.instances).toHaveLength(2);
  });
});
