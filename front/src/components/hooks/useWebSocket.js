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
  const lastFollowDateRef = useRef(null);
  const lastFollowGameRef = useRef(null);
  const followDateRef = useRef(followDate);
  const followGameRef = useRef(followGame);
  
  // Keep refs updated for callbacks
  const gameIdRef = useRef(gameId);
  const dateRef = useRef(date);

  gameIdRef.current = gameId;
  dateRef.current = date;
  followDateRef.current = followDate;
  followGameRef.current = followGame;
  
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
      setWs(null);
    };
  }, [enabled, sendSubscriptions, onPlayByPlayUpdate, onBoxUpdate, onDateUpdate]);

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

  return { ws, connect, close };
}
