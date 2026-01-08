import CircularProgress from '@mui/material/CircularProgress';
import './Boxscore.scss';
import processTeamStats from './processTeamStats';
import { useState, useEffect, useRef } from 'react';
import { useMinimumLoadingState } from '../hooks/useMinimumLoadingState';

const LOADING_TEXT_DELAY_MS = 500;
const MIN_BLUR_MS = 300;


export default function Boxscore({ box, isLoading, statusMessage }) {
  const [showMore, setShowMore] = useState(false);
  const [scrollPos, setScrollPos] = useState(100);
  const lastStableBoxRef = useRef(box);
  const [showLoadingText, setShowLoadingText] = useState(false);
  const isBlurred = useMinimumLoadingState(isLoading, MIN_BLUR_MS);
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
    if (isLoading) {
      return;
    }
    const hasStableBoxData = lastStableBoxRef.current && Object.keys(lastStableBoxRef.current).length > 0;
    if (isBlurred && hasStableBoxData) {
      return;
    }
    lastStableBoxRef.current = box;
  }, [box, isLoading, isBlurred]);

  const hasStableBoxData = lastStableBoxRef.current && Object.keys(lastStableBoxRef.current).length > 0;
  const displayBox = (isLoading || (isBlurred && hasStableBoxData)) && lastStableBoxRef.current
    ? lastStableBoxRef.current
    : box;
  const hasBoxData = displayBox && Object.keys(displayBox).length > 0;
  const isDataLoading = isBlurred && hasBoxData;

  useEffect(() => {
    if (isLoading && hasBoxData) {
      const timer = setTimeout(() => setShowLoadingText(true), LOADING_TEXT_DELAY_MS);
      return () => clearTimeout(timer);
    }
    setShowLoadingText(false);
  }, [isLoading, hasBoxData]);

  const showLoadingOverlay = isLoading && hasBoxData && showLoadingText;

  const awayBox = processTeamStats(
    displayBox?.awayTeam,
    false,
    showMore,
    setShowMore,
    scrollPos,
    setScrollPos,
    isCompact
  );
  const homeBox = processTeamStats(
    displayBox?.homeTeam,
    true,
    showMore,
    setShowMore,
    scrollPos,
    setScrollPos,
    isCompact
  );

  if (statusMessage && !isLoading) {
    return (
      <div className='box'>
        <div className='statusMessage'>{statusMessage}</div>
      </div>
    );
  }

  return (
    <div className={`box ${isDataLoading ? 'isLoading' : ''}`}>
      {showLoadingOverlay && (
        <div className='loadingOverlay'>
          <CircularProgress size={20} thickness={5} />
          <span>Loading box score...</span>
        </div>
      )}
      {isLoading && !hasBoxData ? (
        <div className='loadingIndicator'>
          <CircularProgress size={24} thickness={5} />
          <span>Loading box score...</span>
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
