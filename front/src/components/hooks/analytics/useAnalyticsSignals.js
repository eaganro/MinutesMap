import { useEffect, useRef } from 'react';
import { trackPostHogEvent, trackPostHogPageView } from '../../../helpers/analytics';

const DEFAULT_HEARTBEAT_INTERVAL_MS = 15000;
const UMAMI_WAIT_INTERVAL_MS = 250;
const UMAMI_WAIT_MAX_ATTEMPTS = 40;

export function useAnalyticsSignals({
  gameId,
  date,
  currentScheduleGameStatus,
  isInitLoading,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
}) {
  const lastTrackedGameIdRef = useRef(null);
  const closeSignalSentRef = useRef(false);
  const umamiWaitIdsRef = useRef(new Set());
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
    const trackedTitle = document.title;
    const trackUmamiPageView = () => {
      window.umami.track((props) => ({
        ...props,
        url: trackedUrl,
        title: trackedTitle,
      }));
    };
    // The umami script loads async and often arrives after the first game data,
    // so wait for it instead of dropping the pageview.
    if (window?.umami?.track) {
      trackUmamiPageView();
    } else {
      const waitIds = umamiWaitIdsRef.current;
      let attempts = 0;
      const waitId = window.setInterval(() => {
        attempts += 1;
        const ready = Boolean(window?.umami?.track);
        if (!ready && attempts < UMAMI_WAIT_MAX_ATTEMPTS) return;
        window.clearInterval(waitId);
        waitIds.delete(waitId);
        if (ready) trackUmamiPageView();
      }, UMAMI_WAIT_INTERVAL_MS);
      waitIds.add(waitId);
    }
    trackPostHogPageView({
      gameId: gameId || null,
      date: date || null,
      status: currentScheduleGameStatus || null,
    });
  }, [date, gameId, currentScheduleGameStatus, isInitLoading]);

  useEffect(() => {
    const waitIds = umamiWaitIdsRef.current;
    return () => {
      waitIds.forEach((waitId) => window.clearInterval(waitId));
      waitIds.clear();
    };
  }, []);

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
