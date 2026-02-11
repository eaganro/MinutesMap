import CircularProgress from '@mui/material/CircularProgress';
import './Boxscore.scss';
import processTeamStats from './processTeamStats';
import { useState, useEffect, useRef } from 'react';
import { useMinimumLoadingState } from '../hooks/ui/useMinimumLoadingState';
import { useTheme } from '../hooks/ui/useTheme';
import { getMatchupColors } from '../../helpers/teamColors';
import { useStableWhileLoading } from '../hooks/ui/useStableWhileLoading';
import { useTrackFeatureUseOnce } from '../hooks/analytics/useTrackFeatureUseOnce';
import { LOADING_TEXT_DELAY_MS, MIN_BLUR_MS } from '../constants/loadingUiTimings';

export default function Boxscore({ box, isLoading, statusMessage }) {
  const [showMore, setShowMore] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'min', direction: 'desc' });
  const [showLoadingText, setShowLoadingText] = useState(false);
  const isBlurred = useMinimumLoadingState(isLoading, MIN_BLUR_MS);
  const { isDarkMode } = useTheme();
  const awayTableRef = useRef(null);
  const homeTableRef = useRef(null);
  const isSyncingScrollRef = useRef(false);
  const syncRafRef = useRef(null);
  const trackBoxscoreFeatureUse = useTrackFeatureUseOnce('boxscore');
  const [isCompact, setIsCompact] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 640px)').matches : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const mediaQuery = window.matchMedia('(max-width: 640px)');
    const handleChange = (event) => setIsCompact(event.matches);

    setIsCompact(mediaQuery.matches);
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  const { displayData: displayBox, displayStatusMessage } = useStableWhileLoading({
    data: box,
    statusMessage,
    isLoading,
    isBlurred,
  });
  const hasBoxData = displayBox && Object.keys(displayBox).length > 0;
  const hasIncomingBoxData = box && Object.keys(box).length > 0;
  const showStatusMessage = Boolean(displayStatusMessage) && !hasBoxData;
  const isDataLoading = isBlurred && (hasBoxData || hasIncomingBoxData || showStatusMessage);
  const matchupColors = getMatchupColors(
    displayBox?.teams?.away?.abbr,
    displayBox?.teams?.home?.abbr,
    isDarkMode,
  );

  useEffect(() => {
    if (isLoading && hasBoxData) {
      const timer = setTimeout(() => setShowLoadingText(true), LOADING_TEXT_DELAY_MS);
      return () => clearTimeout(timer);
    }
    setShowLoadingText(false);
  }, [isLoading, hasBoxData]);

  const showLoadingOverlay = isLoading && hasBoxData && showLoadingText;

  const syncScroll = (sourceRef, targetRef) => {
    if (isSyncingScrollRef.current) {
      return;
    }
    const sourceNode = sourceRef.current;
    const targetNode = targetRef.current;
    if (!sourceNode || !targetNode) {
      return;
    }
    const nextScrollLeft = sourceNode.scrollLeft;
    if (targetNode.scrollLeft === nextScrollLeft) {
      return;
    }
    isSyncingScrollRef.current = true;
    if (syncRafRef.current) {
      cancelAnimationFrame(syncRafRef.current);
    }
    syncRafRef.current = requestAnimationFrame(() => {
      targetNode.scrollLeft = nextScrollLeft;
      requestAnimationFrame(() => {
        isSyncingScrollRef.current = false;
      });
    });
  };

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === 'desc' ? 'asc' : 'desc',
        };
      }
      return { key, direction: 'desc' };
    });
  };

  const awayBox = processTeamStats(
    displayBox?.teams?.away,
    false,
    showMore,
    setShowMore,
    awayTableRef,
    () => syncScroll(awayTableRef, homeTableRef),
    isCompact,
    matchupColors?.away,
    sortConfig,
    handleSort,
  );
  const homeBox = processTeamStats(
    displayBox?.teams?.home,
    true,
    showMore,
    setShowMore,
    homeTableRef,
    () => syncScroll(homeTableRef, awayTableRef),
    isCompact,
    matchupColors?.home,
    sortConfig,
    handleSort,
  );

  const showLoadingIndicator = isLoading && !hasBoxData && !showStatusMessage;

  return (
    <div
      className={`box ${isDataLoading ? 'isLoading' : ''}`}
      onClick={trackBoxscoreFeatureUse}
      onTouchStart={trackBoxscoreFeatureUse}
    >
      {showLoadingOverlay && (
        <div className="loadingOverlay">
          <CircularProgress size={20} thickness={5} />
          <span>Loading box score...</span>
        </div>
      )}
      {showLoadingIndicator ? (
        <div className="loadingIndicator">
          <CircularProgress size={24} thickness={5} />
          <span>Loading box score...</span>
        </div>
      ) : showStatusMessage ? (
        <div className="boxContent">
          <div className="statusMessage">{displayStatusMessage}</div>
        </div>
      ) : (
        <div className="boxContent">
          {awayBox}
          {homeBox}
        </div>
      )}
    </div>
  );
}
