import { useState, useEffect, useRef, useCallback } from 'react';
import { wsLocation } from '../../environment';

/**
 * Hook for managing WebSocket connection to the game server
 */
export function useWebSocket({ 
  gameId, 
  date, 
  onPlayByPlayUpdate, 
  onBoxUpdate, 
  onDateUpdate 
}) {
  const [ws, setWs] = useState(null);
  const wsRef = useRef(null);
  
  // Keep refs updated for callbacks
  const gameIdRef = useRef(gameId);
  const dateRef = useRef(date);
  
  useEffect(() => {
    gameIdRef.current = gameId;
  }, [gameId]);
  
  useEffect(() => {
    dateRef.current = date;
  }, [date]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || 
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const newWs = new WebSocket(wsLocation);
    wsRef.current = newWs;
    setWs(newWs);

    newWs.onopen = () => {
      console.log('Connected to WebSocket');
      if (gameIdRef.current) {
        newWs.send(JSON.stringify({ action: 'followGame', gameId: gameIdRef.current }));
      }
      if (dateRef.current) {
        newWs.send(JSON.stringify({ action: 'followDate', date: dateRef.current }));
      }
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
        if (msg.key?.includes("playByPlayData")) {
          onPlayByPlayUpdate?.(msg.key, msg.version);
        } else if (msg.key?.includes("boxData")) {
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
    };
  }, [onPlayByPlayUpdate, onBoxUpdate, onDateUpdate]);

  // Initial connection
  useEffect(() => {
    connect();
  }, [connect]);

  // Follow date changes
  useEffect(() => {
    if (!date) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'followDate', date }));
    } else if (wsRef.current !== null) {
      connect();
    }
  }, [date, connect]);

  // Follow game changes
  useEffect(() => {
    if (!gameId) return;
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'followGame', gameId }));
    } else if (wsRef.current !== null) {
      connect();
    }
  }, [gameId, connect]);

  const close = useCallback(() => {
    wsRef.current?.close();
  }, []);

  return { ws, connect, close };
}