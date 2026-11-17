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
import { useTheme } from '../hooks/ui/useTheme';
import { getMatchupColors } from '../../helpers/teamColors';
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
  const { isDarkMode } = useTheme();
  const isBlurred = useMinimumLoadingState(isLoading, MIN_BLUR_MS, { skipFirstLoad: true });

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
  const { isLive, isFinal } = parseGameStatus(displayData.gameStatus);
  const formattedPeriod = formatPeriod(displayData.lastAction?.period);
  const formattedClock = formatClock(displayData.lastAction?.clock);
  const hasActionTime = Boolean(formattedPeriod && formattedClock);
  let gameTimeLabel = '';

  if (statusLabel) {
    gameTimeLabel = statusLabel;
  } else if (hasActionTime) {
    gameTimeLabel = `${formattedPeriod} ${formattedClock}`;
  }

  // The same colours the chart's score-lead area uses, so the scoreboard keys them.
  const matchupColors =
    displayData.awayTeam && displayData.homeTeam
      ? getMatchupColors(displayData.awayTeam, displayData.homeTeam, isDarkMode)
      : null;
  const awayScore = Number(displayData.score?.away);
  const homeScore = Number(displayData.score?.home);
  const hasWinner = isFinal && Number.isFinite(awayScore) && Number.isFinite(homeScore);
  const awayLost = hasWinner && awayScore < homeScore;
  const homeLost = hasWinner && homeScore < awayScore;

  const renderTeam = (team, logoImage, side, isPending) => {
    const logo = (
      <img
        {...logoImage.imgProps}
        height="56"
        width="56"
        className={`teamLogo ${side}Img`}
        alt={onSelectTeam ? '' : team}
      />
    );
    return (
      <div className={`scoreTeam ${side}`}>
        <div className={`logoWrapper${isPending ? ' isPending' : ''}`}>
          {onSelectTeam ? (
            <button
              type="button"
              className="teamLogoButton"
              onClick={() => onSelectTeam(team, { source: 'scoreboard' })}
              aria-label={`Show ${team} season games`}
              title={`Show ${team} season games`}
            >
              {logo}
            </button>
          ) : (
            logo
          )}
        </div>
        <span className="scoreTeamCode" aria-hidden="true">
          <span className="scoreTeamSwatch" />
          {team}
        </span>
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
      style={
        matchupColors
          ? { '--away-color': matchupColors.away, '--home-color': matchupColors.home }
          : undefined
      }
    >
      {showOverlay && (
        <div className="loadingOverlay" role="status">
          <CircularProgress size={20} thickness={5} />
          <span>Loading game...</span>
        </div>
      )}
      <div className="scoreContent">
        <div className="scoreArea">
          {displayData.awayTeam ? (
            renderTeam(displayData.awayTeam, awayLogo, 'away', awayLogoPending)
          ) : (
            <div className="scoreTeam away" />
          )}
          <div className={`scoreValue away${awayLost ? ' isTrailing' : ''}`}>
            {displayData.score ? displayData.score.away : '--'}
          </div>
          <div className="scoreMeta">
            {gameTimeLabel && (
              <div className={`gameTime${isLive ? ' isLive' : ''}`}>
                {isLive && (
                  <span className="liveDotIndicator" role="img" aria-label="Live game">
                    <span className="liveDot" />
                  </span>
                )}
                <span className="timeText">{gameTimeLabel}</span>
              </div>
            )}
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
          </div>
          <div className={`scoreValue home${homeLost ? ' isTrailing' : ''}`}>
            {displayData.score ? displayData.score.home : '--'}
          </div>
          {displayData.homeTeam ? (
            renderTeam(displayData.homeTeam, homeLogo, 'home', homeLogoPending)
          ) : (
            <div className="scoreTeam home" />
          )}
        </div>
      </div>
      {/* {statusMessage && (
        <div className='statusMessage'>{statusMessage}</div>
      )} */}
    </div>
  );
}
