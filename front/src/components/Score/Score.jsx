import { useEffect, useMemo, useState } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import './Score.scss';
import { ASSET_PREFIX } from '../../environment';
import { formatClock, formatPeriod, formatStatusText } from '../../helpers/utils';
import { useMinimumLoadingState } from '../hooks/ui/useMinimumLoadingState';
import { useStableWhileLoading } from '../hooks/ui/useStableWhileLoading';
import { toDateInputValue } from '../hooks/schedule/useDateInputState';
import { LOADING_TEXT_DELAY_MS, MIN_BLUR_MS } from '../constants/loadingUiTimings';
import { parseGameStatus } from '../../domain/game-selection/status';
import { useLoadedImage } from '../hooks/ui/useLoadedImage';
const LOGO_BASE_PATH = `${ASSET_PREFIX ? ASSET_PREFIX : ''}/img/teams`;
const buildLogoSrc = (team) => `${LOGO_BASE_PATH}/${team}.svg`;

export default function Score({
  homeTeam,
  awayTeam,
  score,
  date,
  changeDate,
  isLoading,
  lastAction,
  gameStatus,
  onSelectTeam,
}) {
  const [showLoadingText, setShowLoadingText] = useState(false);
  const isBlurred = useMinimumLoadingState(isLoading, MIN_BLUR_MS);

  const incomingData = useMemo(
    () => ({
      homeTeam,
      awayTeam,
      score,
      date,
      lastAction,
      gameStatus,
    }),
    [homeTeam, awayTeam, score, date, lastAction, gameStatus],
  );

  const { displayData } = useStableWhileLoading({
    data: incomingData,
    isLoading,
    isBlurred,
  });

  // Loaded state follows each logo's URL, so a team that stays put between games keeps
  // its logo instead of falling back to the placeholder.
  const awayLogo = useLoadedImage(displayData.awayTeam ? buildLogoSrc(displayData.awayTeam) : null);
  const homeLogo = useLoadedImage(displayData.homeTeam ? buildLogoSrc(displayData.homeTeam) : null);

  const hasDisplayData = Boolean(
    displayData?.homeTeam || displayData?.awayTeam || displayData?.score || displayData?.date,
  );
  const hasIncomingData = Boolean(
    incomingData?.homeTeam || incomingData?.awayTeam || incomingData?.score || incomingData?.date,
  );
  const awayLogoPending = Boolean(displayData.awayTeam) && !awayLogo.isLoaded;
  const homeLogoPending = Boolean(displayData.homeTeam) && !homeLogo.isLoaded;
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
      <div className="scoreElement" role="region" aria-label="Game score" aria-busy="true">
        <div className="loadingIndicator" role="status">
          <CircularProgress size={24} thickness={5} />
          <span>Loading game...</span>
        </div>
      </div>
    );
  }

  const gameDate = displayData.date ? new Date(displayData.date) : null;
  const rawStatusLabel =
    typeof displayData.gameStatus === 'string' ? displayData.gameStatus.trim() : '';
  const statusLabel = formatStatusText(rawStatusLabel);
  const { isLive } = parseGameStatus(displayData.gameStatus);
  const formattedPeriod = formatPeriod(displayData.lastAction?.period);
  const formattedClock = formatClock(displayData.lastAction?.clock);
  const hasActionTime = Boolean(formattedPeriod && formattedClock);
  let gameTimeLabel = '';

  if (statusLabel) {
    gameTimeLabel = statusLabel;
  } else if (hasActionTime) {
    gameTimeLabel = `${formattedPeriod} ${formattedClock}`;
  }

  const renderLogo = (team, logoImage, className, isPending) => {
    const logo = (
      <img
        {...logoImage.imgProps}
        height="80"
        width="80"
        className={`teamLogo ${className}`}
        alt={onSelectTeam ? '' : team}
      />
    );
    return (
      <div className={`logoWrapper${isPending ? ' isPending' : ''}`}>
        {onSelectTeam ? (
          <button
            type="button"
            className="teamLogoButton"
            onClick={() => onSelectTeam(team)}
            aria-label={`Show ${team} season games`}
            title={`Show ${team} season games`}
          >
            {logo}
          </button>
        ) : (
          logo
        )}
      </div>
    );
  };

  const changeToGameDate = () => {
    const nextDate = toDateInputValue(displayData.date);
    if (!nextDate) {
      return;
    }
    changeDate(nextDate);
  };

  return (
    <div
      className={`scoreElement ${isDataLoading ? 'isLoading' : ''}`}
      role="region"
      aria-label="Game score"
      aria-busy={isLoading}
    >
      {showOverlay && (
        <div className="loadingOverlay" role="status">
          <CircularProgress size={20} thickness={5} />
          <span>Loading game...</span>
        </div>
      )}
      <div className="scoreContent">
        <button
          type="button"
          onClick={changeToGameDate}
          className="gameDate"
          disabled={!gameDate || isDataLoading}
          aria-label={
            gameDate ? `Show schedule for ${gameDate.toDateString().slice(4)}` : undefined
          }
        >
          {gameDate ? gameDate.toDateString().slice(4) : '---'}
        </button>
        <div className="scoreArea">
          <div>{displayData.score ? displayData.score.away : '--'}</div>
          {displayData.awayTeam &&
            renderLogo(displayData.awayTeam, awayLogo, 'awayImg', awayLogoPending)}
          <div className="at">AT</div>
          {displayData.homeTeam &&
            renderLogo(displayData.homeTeam, homeLogo, 'homeImg', homeLogoPending)}
          <div>{displayData.score ? displayData.score.home : '--'}</div>
        </div>
        {gameTimeLabel && (
          <div className="gameTime">
            <span className="timeText">{gameTimeLabel}</span>
            {isLive && (
              <span className="liveDotIndicator" role="img" aria-label="Live game">
                <span className="liveDot" />
              </span>
            )}
          </div>
        )}
      </div>
      {/* {statusMessage && (
        <div className='statusMessage'>{statusMessage}</div>
      )} */}
    </div>
  );
}
