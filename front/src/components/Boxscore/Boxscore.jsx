import CircularProgress from '@mui/material/CircularProgress';
import './Boxscore.scss';
import processTeamStats from './processTeamStats';
import { useState, useEffect, useRef } from 'react';
import { useMinimumLoadingState } from '../hooks/useMinimumLoadingState';
import { useTheme } from '../hooks/useTheme';
import { getMatchupColors } from '../../helpers/teamColors';

const LOADING_TEXT_DELAY_MS = 500;
const MIN_BLUR_MS = 300;


export default function Boxscore({ box, isLoading, statusMessage }) {
  const [showMore, setShowMore] = useState(false);
  const lastStableBoxRef = useRef(box);
  const lastStatusMessageRef = useRef(statusMessage);
  const [showLoadingText, setShowLoadingText] = useState(false);
  const isBlurred = useMinimumLoadingState(isLoading, MIN_BLUR_MS);
  const { isDarkMode } = useTheme();
  const awayTableRef = useRef(null);
  const homeTableRef = useRef(null);
  const isSyncingScrollRef = useRef(false);
  const syncRafRef = useRef(null);
  const [isCompact, setIsCompact] = useState(() => (
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 640px)').matches
      : false
  ));

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

  useEffect(() => {
    if (isLoading || isBlurred) {
      return;
    }
    lastStableBoxRef.current = box;
  }, [box, isLoading, isBlurred]);

  useEffect(() => {
    if (isLoading || isBlurred) {
      return;
    }
    lastStatusMessageRef.current = statusMessage;
  }, [statusMessage, isLoading, isBlurred]);

  const displayBox = (isLoading || isBlurred) ? lastStableBoxRef.current : box;
  const displayStatusMessage = (isLoading || isBlurred) ? lastStatusMessageRef.current : statusMessage;
  const hasBoxData = displayBox && Object.keys(displayBox).length > 0;
  const hasIncomingBoxData = box && Object.keys(box).length > 0;
  const showStatusMessage = Boolean(displayStatusMessage) && !hasBoxData;
  const isDataLoading = isBlurred && (hasBoxData || hasIncomingBoxData || showStatusMessage);
  const matchupColors = getMatchupColors(
    displayBox?.teams?.away?.abbr,
    displayBox?.teams?.home?.abbr,
    isDarkMode
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

  const awayBox = processTeamStats(
    displayBox?.teams?.away,
    false,
    showMore,
    setShowMore,
    awayTableRef,
    () => syncScroll(awayTableRef, homeTableRef),
    isCompact,
    matchupColors?.away
  );
  const homeBox = processTeamStats(
    displayBox?.teams?.home,
    true,
    showMore,
    setShowMore,
    homeTableRef,
    () => syncScroll(homeTableRef, awayTableRef),
    isCompact,
    matchupColors?.home
  );

  const showLoadingIndicator = isLoading && !hasBoxData && !showStatusMessage;

  return (
    <div className={`box ${isDataLoading ? 'isLoading' : ''}`}>
      {showLoadingOverlay && (
        <div className='loadingOverlay'>
          <CircularProgress size={20} thickness={5} />
          <span>Loading box score...</span>
        </div>
      )}
      {showLoadingIndicator ? (
        <div className='loadingIndicator'>
          <CircularProgress size={24} thickness={5} />
          <span>Loading box score...</span>
        </div>
      ) : showStatusMessage ? (
        <div className='boxContent'>
          <div className='statusMessage'>{displayStatusMessage}</div>
        </div>
      ) : (
        <div className='boxContent'>
          {awayBox}
          {homeBox}
        </div>
      )}
    </div>
  );
}
