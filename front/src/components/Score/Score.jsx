import { useEffect, useRef, useState } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import './Score.scss';
import { ASSET_PREFIX } from '../../environment';
import { formatClock, formatPeriod } from '../../helpers/utils';
import { useMinimumLoadingState } from '../hooks/useMinimumLoadingState';

const LOADING_TEXT_DELAY_MS = 500;
const MIN_BLUR_MS = 300;
const LOGO_BASE_PATH = `${ASSET_PREFIX ? ASSET_PREFIX : ''}/img/teams`;
const buildLogoSrc = (team) => `${LOGO_BASE_PATH}/${team}.svg`;

export default function Score({
  homeTeam,
  awayTeam,
  score,
  date,
  changeDate,
  isLoading,
  statusMessage,
  lastAction,
  gameStatus,
}) {
  const [displayData, setDisplayData] = useState(() => ({
    homeTeam,
    awayTeam,
    score,
    date,
    lastAction,
    gameStatus,
  }));
  const [awayLogoLoaded, setAwayLogoLoaded] = useState(false);
  const [homeLogoLoaded, setHomeLogoLoaded] = useState(false);
  const [showLoadingText, setShowLoadingText] = useState(false);
  const awayImgRef = useRef(null);
  const homeImgRef = useRef(null);
  const isBlurred = useMinimumLoadingState(isLoading, MIN_BLUR_MS);

  useEffect(() => {
    if (isLoading || isBlurred) {
      return;
    }
    setDisplayData({ homeTeam, awayTeam, score, date, lastAction, gameStatus });
  }, [homeTeam, awayTeam, score, date, lastAction, gameStatus, isLoading, isBlurred]);

  useEffect(() => {
    setAwayLogoLoaded(false);
    setHomeLogoLoaded(false);
  }, [displayData.awayTeam, displayData.homeTeam]);

  useEffect(() => {
    const awayImg = awayImgRef.current;
    if (awayImg?.complete && awayImg.naturalWidth > 0) {
      setAwayLogoLoaded(true);
    }
  }, [displayData.awayTeam]);

  useEffect(() => {
    const homeImg = homeImgRef.current;
    if (homeImg?.complete && homeImg.naturalWidth > 0) {
      setHomeLogoLoaded(true);
    }
  }, [displayData.homeTeam]);

  const hasDisplayData = Boolean(
    displayData?.homeTeam ||
    displayData?.awayTeam ||
    displayData?.score ||
    displayData?.date
  );
  const hasIncomingData = Boolean(homeTeam || awayTeam || score || date);
  const awayLogoPending = Boolean(displayData.awayTeam) && !awayLogoLoaded;
  const homeLogoPending = Boolean(displayData.homeTeam) && !homeLogoLoaded;
  const isDataLoading = isBlurred && (hasDisplayData || hasIncomingData);

  useEffect(() => {
    if (isLoading && hasDisplayData) {
      const timer = setTimeout(() => setShowLoadingText(true), LOADING_TEXT_DELAY_MS);
      return () => clearTimeout(timer);
    }
    setShowLoadingText(false);
  }, [isLoading, hasDisplayData]);

  const showOverlay = isLoading && hasDisplayData && showLoadingText;

  if (isLoading && !hasDisplayData) {
    return (
      <div className='scoreElement'>
        <div className='loadingIndicator'>
          <CircularProgress size={24} thickness={5} />
          <span>Loading game...</span>
        </div>
      </div>
    );
  }

  const gameDate = displayData.date ? new Date(displayData.date) : null;
  const statusLabel = typeof displayData.gameStatus === 'string' ? displayData.gameStatus.trim() : '';
  const formattedPeriod = formatPeriod(displayData.lastAction?.period);
  const formattedClock = formatClock(displayData.lastAction?.clock);
  const hasActionTime = Boolean(formattedPeriod && formattedClock);
  let gameTimeLabel = '';

  if (statusLabel) {
    const isFinal = statusLabel.startsWith('Final');
    const isUpcoming = statusLabel.endsWith('ET');
    if (isFinal || isUpcoming) {
      gameTimeLabel = statusLabel;
    }
  }
  if (!gameTimeLabel && hasActionTime) {
    gameTimeLabel = `${formattedPeriod} ${formattedClock}`;
  }
  if (!gameTimeLabel && statusLabel) {
    gameTimeLabel = statusLabel;
  }

  const changeToGameDate = () => {
    if (!gameDate) {
      return;
    }
    let month = gameDate.getMonth() + 1;
    if (month < 10) {
      month = '0' + month;
    }
    let day = gameDate.getDate();
    if (day < 10) {
      day = '0' + day;
    }
    let val = `${gameDate.getFullYear()}-${month}-${day}`
    changeDate({ target: { value: val }});
  }

  return (
    <div className={`scoreElement ${isDataLoading ? 'isLoading' : ''}`}>
      {showOverlay && (
        <div className='loadingOverlay'>
          <CircularProgress size={20} thickness={5} />
          <span>Loading game...</span>
        </div>
      )}
      <div className='scoreContent'>
        <div
          onClick={gameDate ? changeToGameDate : undefined}
          className='gameDate'
          style={{ cursor: gameDate ? 'pointer' : 'default' }}
        >
          {gameDate ? gameDate.toDateString().slice(4) : '---'}
        </div>
        <div className='scoreArea'>
          <div>{displayData.score ? displayData.score.away : '--'}</div>
          {displayData.awayTeam && (
            <div className={`logoWrapper${awayLogoPending ? ' isPending' : ''}`}>
              <img
                ref={awayImgRef}
                height="80"
                width="80"
                className='teamLogo awayImg'
                src={buildLogoSrc(displayData.awayTeam)}
                alt={displayData.awayTeam}
                onLoad={() => setAwayLogoLoaded(true)}
                onError={() => setAwayLogoLoaded(false)}
              />
            </div>
          )}
          <div className='at'>AT</div>
          {displayData.homeTeam && (
            <div className={`logoWrapper${homeLogoPending ? ' isPending' : ''}`}>
              <img
                ref={homeImgRef}
                height="80"
                width="80"
                className='teamLogo homeImg'
                src={buildLogoSrc(displayData.homeTeam)}
                alt={displayData.homeTeam}
                onLoad={() => setHomeLogoLoaded(true)}
                onError={() => setHomeLogoLoaded(false)}
              />
            </div>
          )}
          <div>{displayData.score ? displayData.score.home : '--'}</div>
        </div>
        {gameTimeLabel && (
          <div className='gameTime'>{gameTimeLabel}</div>
        )}
      </div>
      {/* {statusMessage && (
        <div className='statusMessage'>{statusMessage}</div>
      )} */}
    </div>
  );
}
