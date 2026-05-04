import { useEffect, useRef } from 'react';
import { trackPostHogEvent, trackPostHogPageView } from '../../../helpers/analytics';

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
    const trackedUrl = `${window.location.pathname}${window.location.search}`;
    if (window?.umami?.track) {
      window.umami.track((props) => ({
        ...props,
        url: trackedUrl,
        title: document.title,
      }));
    }
    trackPostHogPageView({
      gameId: gameId || null,
      date: date || null,
      status: currentScheduleGameStatus || null,
    });
  }, [date, gameId, currentScheduleGameStatus, isInitLoading]);

  useEffect(() => {
    if (isInitLoading) return;

    const sendHeartbeat = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') {
        return;
      }
      const payload = heartbeatPayloadRef.current;
      const trackedUrl = `${window.location.pathname}${window.location.search}`;
      const eventData = {
        url: trackedUrl,
        title: document.title,
        gameId: payload.gameId,
        date: payload.date,
        status: payload.status,
      };
      if (window?.umami?.track) {
        window.umami.track('heartbeat', eventData);
      }
      trackPostHogEvent('heartbeat', eventData);
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
      const trackedUrl = `${window.location.pathname}${window.location.search}`;
      const eventData = {
        reason,
        url: trackedUrl,
        title: document.title,
        gameId: gameId || null,
        date: date || null,
        status: currentScheduleGameStatus || null,
      };
      if (window?.umami?.track) {
        window.umami.track('page-close', eventData);
      }
      trackPostHogEvent('page-close', eventData);
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
