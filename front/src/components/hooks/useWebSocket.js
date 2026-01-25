import { useState, useEffect, useRef, useCallback } from 'react';
import { wsLocation } from '../../environment';

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
  onBoxUpdate, 
  onDateUpdate 
}) {
  const [ws, setWs] = useState(null);
  const wsRef = useRef(null);
  const connectRef = useRef(null);
  const lastFollowDateRef = useRef(null);
  const lastFollowGameRef = useRef(null);
  const followDateRef = useRef(followDate);
  const followGameRef = useRef(followGame);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const allowReconnectRef = useRef(enabled);
  
  // Keep refs updated for callbacks
  const gameIdRef = useRef(gameId);
  const dateRef = useRef(date);

  gameIdRef.current = gameId;
  dateRef.current = date;
  followDateRef.current = followDate;
  followGameRef.current = followGame;
  allowReconnectRef.current = enabled;
  
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
    if (!allowReconnectRef.current) {
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
      reconnectAttemptRef.current = Math.min(reconnectAttemptRef.current + 1, 10);
      connectRef.current?.();
    }, jitteredDelay);
  }, [clearReconnectTimer]);

  const connect = useCallback(() => {
    if (!enabled) {
      return;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN || 
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const newWs = new WebSocket(wsLocation);
    wsRef.current = newWs;
    setWs(newWs);

    newWs.onopen = () => {
      console.log('Connected to WebSocket');
      resetReconnectState();
      sendSubscriptions();
    };

    newWs.onmessage = async (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (err) {
        console.error("Malformed WS message", event.data, err);
        return;
      }
    
      try {
        if (msg.key?.includes("gamepack")) {
          onPlayByPlayUpdate?.(msg.key, msg.version);
        } else if (msg.key?.includes("gameflow") || msg.key?.includes("playByPlayData")) {
          onPlayByPlayUpdate?.(msg.key, msg.version);
        } else if (msg.key?.includes("gameStats")) {
          onBoxUpdate?.(msg.key, msg.version);
        } 
        else if (msg.type === "date_update") {
          onDateUpdate?.(msg.date);
        }
      } catch (err) {
        console.error("Error handling WS message", msg, err);
      }
    };

    newWs.onclose = () => {
      console.log('Disconnected from WebSocket');
      lastFollowDateRef.current = null;
      lastFollowGameRef.current = null;
      wsRef.current = null;
      setWs(null);
      scheduleReconnect();
    };

    newWs.onerror = () => {
      if (newWs.readyState !== WebSocket.OPEN) {
        scheduleReconnect();
      }
    };
  }, [
    enabled,
    sendSubscriptions,
    onPlayByPlayUpdate,
    onBoxUpdate,
    onDateUpdate,
    resetReconnectState,
    scheduleReconnect,
  ]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (!enabled) {
      resetReconnectState();
    }
  }, [enabled, resetReconnectState]);

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
      connect();
      return;
    }
    wsRef.current?.close();
  }, [enabled, connect]);

  useEffect(() => {
    if (!enabled) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      sendSubscriptions();
    } else if (wsRef.current !== null) {
      connect();
    }
  }, [enabled, date, gameId, followDate, followGame, connect, sendSubscriptions]);

  const close = useCallback(() => {
    wsRef.current?.close();
  }, []);

  useEffect(() => {
    return () => {
      resetReconnectState();
    };
  }, [resetReconnectState]);

  return { ws, connect, close };
}
