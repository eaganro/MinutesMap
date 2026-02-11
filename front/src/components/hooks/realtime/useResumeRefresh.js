import { useEffect } from 'react';
import { getNbaTodayString } from '../../../domain/game-selection/time';

const DEFAULT_RESUME_REFRESH_COOLDOWN_MS = 30000;
const DEFAULT_RESUME_REFRESH_WS_COOLDOWN_MS = 60000;

export function useResumeRefresh({
  date,
  gameId,
  isSelectedGameFinal,
  isWebSocketOpen,
  fetchGamePackWithReason,
  fetchScheduleWithReason,
  lastGamePackFetchRef,
  lastScheduleFetchRef,
  resumeRefreshCooldownMs = DEFAULT_RESUME_REFRESH_COOLDOWN_MS,
  resumeRefreshWsCooldownMs = DEFAULT_RESUME_REFRESH_WS_COOLDOWN_MS,
}) {
  useEffect(() => {
    const resolveThresholdMs = (lastReason) => {
      if (!isWebSocketOpen) {
        return resumeRefreshCooldownMs;
      }
      if (lastReason === 'ws') {
        return resumeRefreshWsCooldownMs;
      }
      return resumeRefreshCooldownMs;
    };

    const maybeRefreshOnResume = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') {
        return;
      }
      const now = Date.now();

      if (gameId && !isSelectedGameFinal) {
        const { at: lastGamePackAt, reason: lastGamePackReason } = lastGamePackFetchRef.current;
        const threshold = resolveThresholdMs(lastGamePackReason);
        if (!lastGamePackAt || now - lastGamePackAt >= threshold) {
          fetchGamePackWithReason({ gameId, showLoading: false }, 'resume');
        }
      }

      const nbaToday = getNbaTodayString();
      const isToday = date && date === nbaToday;
      if (isToday) {
        const { at: lastScheduleAt, reason: lastScheduleReason } = lastScheduleFetchRef.current;
        const threshold = resolveThresholdMs(lastScheduleReason);
        if (!lastScheduleAt || now - lastScheduleAt >= threshold) {
          fetchScheduleWithReason(date, 'resume');
        }
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        maybeRefreshOnResume();
      }
    };

    const handleFocus = () => {
      maybeRefreshOnResume();
    };

    const handleOnline = () => {
      maybeRefreshOnResume();
    };

    const handlePageShow = () => {
      maybeRefreshOnResume();
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
  }, [
    date,
    fetchGamePackWithReason,
    fetchScheduleWithReason,
    gameId,
    isSelectedGameFinal,
    isWebSocketOpen,
    lastGamePackFetchRef,
    lastScheduleFetchRef,
    resumeRefreshCooldownMs,
    resumeRefreshWsCooldownMs,
  ]);
}
