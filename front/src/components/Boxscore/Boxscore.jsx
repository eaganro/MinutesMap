import CircularProgress from '@mui/material/CircularProgress';
import './Boxscore.scss';
import processTeamStats from './processTeamStats';
import { useState, useEffect, useRef } from 'react';

const LOADING_TEXT_DELAY_MS = 500;


export default function Boxscore({ box, isLoading, statusMessage }) {
  const [showMore, setShowMore] = useState(false);
  const [scrollPos, setScrollPos] = useState(100);
  const [width, setWidth] = useState(window.innerWidth);
  const lastStableBoxRef = useRef(box);
  const [showLoadingText, setShowLoadingText] = useState(false);

  useEffect(() => {
    function handleResize() {
      setWidth(window.innerWidth);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [width]);

  useEffect(() => {
    if (!isLoading) {
      lastStableBoxRef.current = box;
    }
  }, [box, isLoading]);

  const displayBox = isLoading && lastStableBoxRef.current ? lastStableBoxRef.current : box;
  const hasBoxData = displayBox && Object.keys(displayBox).length > 0;
  const isDataLoading = isLoading && hasBoxData;

  useEffect(() => {
    if (isLoading && hasBoxData) {
      const timer = setTimeout(() => setShowLoadingText(true), LOADING_TEXT_DELAY_MS);
      return () => clearTimeout(timer);
    }
    setShowLoadingText(false);
  }, [isLoading, hasBoxData]);

  const showLoadingOverlay = isDataLoading && showLoadingText;

  const awayBox = processTeamStats(displayBox?.awayTeam, false, showMore, setShowMore, scrollPos, setScrollPos);
  const homeBox = processTeamStats(displayBox?.homeTeam, true, showMore, setShowMore, scrollPos, setScrollPos);

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
