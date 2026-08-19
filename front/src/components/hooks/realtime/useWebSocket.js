import { useState, useEffect, useRef, useCallback } from 'react';
import { wsLocation } from '../../../environment';
import { reportError } from '../../../errors/reportError';

/**
 * Hook for managing WebSocket connection to the game server
 */
export function useWebSocket({
  gameId,
  date,
  enabled = true,
  followDate = true,
  followGame = true,
  onPlayByPlayUpdate,
  onDateUpdate,
}) {
  const [ws, setWs] = useState(null);
  const wsRef = useRef(null);
  const connectRef = useRef(null);
  const mountedRef = useRef(true);
  const lastFollowDateRef = useRef(null);
  const lastFollowGameRef = useRef(null);
  const followDateRef = useRef(followDate);
  const followGameRef = useRef(followGame);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const allowReconnectRef = useRef(enabled);
  const enabledRef = useRef(enabled);

  // Keep refs updated for callbacks
  const gameIdRef = useRef(gameId);
  const dateRef = useRef(date);
  const onPlayByPlayUpdateRef = useRef(onPlayByPlayUpdate);
  const onDateUpdateRef = useRef(onDateUpdate);

  gameIdRef.current = gameId;
  dateRef.current = date;
  followDateRef.current = followDate;
  followGameRef.current = followGame;
  enabledRef.current = enabled;
  onPlayByPlayUpdateRef.current = onPlayByPlayUpdate;
  onDateUpdateRef.current = onDateUpdate;

  useEffect(() => {
    if (!gameId) {
      lastFollowGameRef.current = null;
    }
  }, [gameId]);

  useEffect(() => {
    if (!date) {
      lastFollowDateRef.current = null;
    }
  }, [date]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const resetReconnectState = useCallback(() => {
    clearReconnectTimer();
    reconnectAttemptRef.current = 0;
  }, [clearReconnectTimer]);

  const sendSubscriptions = useCallback(() => {
    const wsInstance = wsRef.current;
    if (!wsInstance || wsInstance.readyState !== WebSocket.OPEN) {
      return;
    }

    const currentDate = dateRef.current;
    const currentGameId = gameIdRef.current;
    const shouldFollowDate = followDateRef.current;
    const shouldFollowGame = followGameRef.current;

    if (shouldFollowDate && currentDate) {
      if (lastFollowDateRef.current !== currentDate) {
        wsInstance.send(JSON.stringify({ action: 'followDate', date: currentDate }));
        lastFollowDateRef.current = currentDate;
      }
    } else if (!shouldFollowDate && lastFollowDateRef.current) {
      wsInstance.send(JSON.stringify({ action: 'unfollowDate' }));
      lastFollowDateRef.current = null;
    }

    if (shouldFollowGame && currentGameId) {
      if (lastFollowGameRef.current !== currentGameId) {
        wsInstance.send(JSON.stringify({ action: 'followGame', gameId: currentGameId }));
        lastFollowGameRef.current = currentGameId;
      }
    } else if (!shouldFollowGame && lastFollowGameRef.current) {
      wsInstance.send(JSON.stringify({ action: 'unfollowGame' }));
      lastFollowGameRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current || !enabledRef.current || !allowReconnectRef.current) {
      return;
    }

    if (document.visibilityState === 'hidden') {
      return;
    }

    clearReconnectTimer();
    const attempt = reconnectAttemptRef.current;
    const baseDelay = 1000;
    const maxDelay = 30000;
    const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
    const jitteredDelay = Math.round(delay * (0.8 + Math.random() * 0.4));

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (!mountedRef.current || !enabledRef.current || !allowReconnectRef.current) {
        return;
      }
      reconnectAttemptRef.current = Math.min(reconnectAttemptRef.current + 1, 10);
      connectRef.current?.();
    }, jitteredDelay);
  }, [clearReconnectTimer]);

  const releaseSocket = useCallback((socket, { closeSocket = false } = {}) => {
    if (!socket) {
      return;
    }

    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;

    if (wsRef.current === socket) {
      wsRef.current = null;
      lastFollowDateRef.current = null;
      lastFollowGameRef.current = null;
      if (mountedRef.current) {
        setWs(null);
      }
    }

    if (
      closeSocket &&
      socket.readyState !== WebSocket.CLOSING &&
      socket.readyState !== WebSocket.CLOSED
    ) {
      socket.close();
    }
  }, []);

  const disconnect = useCallback(() => {
    const socket = wsRef.current;
    if (socket) {
      releaseSocket(socket, { closeSocket: true });
    }
  }, [releaseSocket]);

  const openSocket = useCallback(() => {
    if (!mountedRef.current || !enabledRef.current || !allowReconnectRef.current) {
      return;
    }
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    const newWs = new WebSocket(wsLocation);
    wsRef.current = newWs;
    setWs(newWs);

    newWs.onopen = () => {
      if (
        !mountedRef.current ||
        !enabledRef.current ||
        wsRef.current !== newWs ||
        !allowReconnectRef.current
      ) {
        return;
      }
      resetReconnectState();
      sendSubscriptions();
    };

    newWs.onmessage = async (event) => {
      if (
        !mountedRef.current ||
        !enabledRef.current ||
        wsRef.current !== newWs ||
        !allowReconnectRef.current
      ) {
        return;
      }

      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (err) {
        reportError(err, {
          boundary: 'websocket-message',
          message_type: 'malformed',
        });
        return;
      }

      try {
        if (msg.key?.includes('gamepack')) {
          onPlayByPlayUpdateRef.current?.(msg.key, msg.version);
        } else if (msg.type === 'date_update') {
          onDateUpdateRef.current?.(msg.date);
        }
      } catch (err) {
        reportError(err, {
          boundary: 'websocket-message',
          message_type: msg?.type || (msg?.key ? 'gamepack' : 'unknown'),
        });
      }
    };

    newWs.onclose = () => {
      if (!mountedRef.current || wsRef.current !== newWs) {
        return;
      }
      releaseSocket(newWs);
      scheduleReconnect();
    };

    newWs.onerror = () => {
      if (!mountedRef.current || wsRef.current !== newWs) {
        return;
      }
      if (newWs.readyState !== WebSocket.OPEN) {
        scheduleReconnect();
      }
    };
  }, [releaseSocket, resetReconnectState, scheduleReconnect, sendSubscriptions]);

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabledRef.current) {
      return;
    }
    allowReconnectRef.current = true;
    resetReconnectState();
    openSocket();
  }, [openSocket, resetReconnectState]);

  useEffect(() => {
    connectRef.current = openSocket;
  }, [openSocket]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      allowReconnectRef.current = false;
      resetReconnectState();
      disconnect();
    };
  }, [disconnect, resetReconnectState]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      if (!allowReconnectRef.current) {
        return;
      }
      resetReconnectState();
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        connectRef.current?.();
      }
    };

    const handleFocus = () => {
      if (!allowReconnectRef.current) {
        return;
      }
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        resetReconnectState();
        connectRef.current?.();
      }
    };

    const handleOnline = () => {
      if (!allowReconnectRef.current) {
        return;
      }
      resetReconnectState();
      connectRef.current?.();
    };

    const handlePageShow = () => {
      if (!allowReconnectRef.current) {
        return;
      }
      resetReconnectState();
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        connectRef.current?.();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [resetReconnectState]);

  // Connection lifecycle
  useEffect(() => {
    if (enabled) {
      allowReconnectRef.current = true;
      resetReconnectState();
      openSocket();
      return;
    }
    allowReconnectRef.current = false;
    resetReconnectState();
    disconnect();
  }, [enabled, disconnect, openSocket, resetReconnectState]);

  useEffect(() => {
    if (!enabled) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      sendSubscriptions();
    } else if (wsRef.current !== null) {
      openSocket();
    }
  }, [enabled, date, gameId, followDate, followGame, openSocket, sendSubscriptions]);

  // Remains closed until connect() is called or enabled cycles from false to true.
  const close = useCallback(() => {
    allowReconnectRef.current = false;
    resetReconnectState();
    disconnect();
  }, [disconnect, resetReconnectState]);

  return { ws, connect, close };
}
