import { useEffect, useRef } from 'react';

const DEFAULT_HEARTBEAT_INTERVAL_MS = 15000;

export function useAnalyticsSignals({
  gameId,
  date,
  currentScheduleGameStatus,
  isInitLoading,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
}) {
  const lastTrackedGameIdRef = useRef(null);
  const closeSignalSentRef = useRef(false);
  const heartbeatPayloadRef = useRef({
    gameId: gameId || null,
    date: date || null,
    status: currentScheduleGameStatus || null,
  });

  useEffect(() => {
    heartbeatPayloadRef.current = {
      gameId: gameId || null,
      date: date || null,
      status: currentScheduleGameStatus || null,
    };
  }, [date, gameId, currentScheduleGameStatus]);

  useEffect(() => {
    if (isInitLoading) return;
    if (!gameId) return;
    if (lastTrackedGameIdRef.current === gameId) return;
    lastTrackedGameIdRef.current = gameId;
    if (!window?.umami?.track) return;
    const trackedUrl = `${window.location.pathname}${window.location.search}`;
    window.umami.track((props) => ({
      ...props,
      url: trackedUrl,
      title: document.title,
    }));
  }, [gameId, isInitLoading]);

  useEffect(() => {
    if (isInitLoading) return;

    const sendHeartbeat = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') {
        return;
      }
      if (!window?.umami?.track) return;
      const payload = heartbeatPayloadRef.current;
      const trackedUrl = `${window.location.pathname}${window.location.search}`;
      window.umami.track('heartbeat', {
        url: trackedUrl,
        title: document.title,
        gameId: payload.gameId,
        date: payload.date,
        status: payload.status,
      });
    };

    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, heartbeatIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isInitLoading, heartbeatIntervalMs]);

  useEffect(() => {
    if (isInitLoading) return;

    const sendCloseSignal = (reason) => {
      if (closeSignalSentRef.current) return;
      closeSignalSentRef.current = true;
      if (!window?.umami?.track) return;
      const trackedUrl = `${window.location.pathname}${window.location.search}`;
      window.umami.track('page-close', {
        reason,
        url: trackedUrl,
        title: document.title,
        gameId: gameId || null,
        date: date || null,
        status: currentScheduleGameStatus || null,
      });
    };

    const handlePageHide = (event) => {
      const reason = event?.persisted ? 'pagehide-bfcache' : 'pagehide';
      sendCloseSignal(reason);
    };

    const handleBeforeUnload = () => {
      sendCloseSignal('beforeunload');
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [date, gameId, currentScheduleGameStatus, isInitLoading]);
}
