import { useEffect, useState } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import './Score.scss';
import { PREFIX } from '../../environment';

const LOADING_TEXT_DELAY_MS = 500;

export default function Score({ homeTeam, awayTeam, score, date, changeDate, isLoading, statusMessage }) {
  const [displayData, setDisplayData] = useState(() => ({
    homeTeam,
    awayTeam,
    score,
    date,
  }));
  const [awayLogoLoaded, setAwayLogoLoaded] = useState(false);
  const [homeLogoLoaded, setHomeLogoLoaded] = useState(false);
  const [showLoadingText, setShowLoadingText] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setDisplayData({ homeTeam, awayTeam, score, date });
    }
  }, [homeTeam, awayTeam, score, date, isLoading]);

  useEffect(() => {
    setAwayLogoLoaded(false);
    setHomeLogoLoaded(false);
  }, [displayData.awayTeam, displayData.homeTeam]);

  const hasDisplayData = Boolean(
    displayData?.homeTeam ||
    displayData?.awayTeam ||
    displayData?.score ||
    displayData?.date
  );
  const awayLogoPending = Boolean(displayData.awayTeam) && !awayLogoLoaded;
  const homeLogoPending = Boolean(displayData.homeTeam) && !homeLogoLoaded;
  const isDataLoading = isLoading;

  useEffect(() => {
    if (isLoading && hasDisplayData) {
      const timer = setTimeout(() => setShowLoadingText(true), LOADING_TEXT_DELAY_MS);
      return () => clearTimeout(timer);
    }
    setShowLoadingText(false);
  }, [isLoading, hasDisplayData]);

  const showOverlay = isLoading && hasDisplayData && showLoadingText;

  if (isDataLoading && !hasDisplayData) {
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
                height="80"
                width="80"
                className='teamLogo awayImg'
                src={`${PREFIX ? PREFIX : ''}/img/teams/${displayData.awayTeam}.png`}
                alt={displayData.awayTeam}
                onLoad={() => setAwayLogoLoaded(true)}
                onError={() => setAwayLogoLoaded(true)}
              />
            </div>
          )}
          <div className='at'>AT</div>
          {displayData.homeTeam && (
            <div className={`logoWrapper${homeLogoPending ? ' isPending' : ''}`}>
              <img
                height="80"
                width="80"
                className='teamLogo homeImg'
                src={`${PREFIX ? PREFIX : ''}/img/teams/${displayData.homeTeam}.png`}
                alt={displayData.homeTeam}
                onLoad={() => setHomeLogoLoaded(true)}
                onError={() => setHomeLogoLoaded(true)}
              />
            </div>
          )}
          <div>{displayData.score ? displayData.score.home : '--'}</div>
        </div>
      </div>
      {/* {statusMessage && (
        <div className='statusMessage'>{statusMessage}</div>
      )} */}
    </div>
  );
}
