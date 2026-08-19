import { useEffect, useRef, useState } from 'react';
import { NavigateNext, NavigateBefore } from '@mui/icons-material';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import { ASSET_PREFIX } from '../../environment';
import { parseGameStatus } from '../../domain/game-selection/status';
import { formatStatusText } from '../../helpers/utils';
import { useDateInputState } from '../hooks/schedule/useDateInputState';
import { useHorizontalDragScroll } from '../hooks/ui/useHorizontalDragScroll';
import { useTrackFeatureUseOnce } from '../hooks/analytics/useTrackFeatureUseOnce';

import './Schedule.scss';

const LOGO_BASE_PATH = `${ASSET_PREFIX ? ASSET_PREFIX : ''}/img/teams`;
const buildLogoSrc = (team) => `${LOGO_BASE_PATH}/${team}.svg`;
const DATE_NAVIGATION_STEP_DAYS = 1;

function TeamLogo({ team }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    setIsLoaded(false);
  }, [team]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete && img.naturalWidth > 0) {
      setIsLoaded(true);
    }
  }, [team]);

  if (!team) return null;

  return (
    <div className={`teamLogoWrapper${!isLoaded ? ' isPending' : ''}`}>
      <img
        ref={imgRef}
        height="16"
        width="16"
        draggable={false}
        loading="lazy"
        className="teamLogo"
        src={buildLogoSrc(team)}
        alt={team}
        onLoad={() => setIsLoaded(true)}
        onError={() => setIsLoaded(false)}
      />
    </div>
  );
}

export default function Schedule({
  games,
  date,
  changeDate,
  changeGame,
  isLoading,
  isPending,
  status,
  error,
  onRetry,
  selectedGameId,
}) {
  const trackDateFeatureUse = useTrackFeatureUseOnce('date-selector');
  const [canScrollGames, setCanScrollGames] = useState(true);
  const { handleDateChange, shiftDate } = useDateInputState({
    date,
    onDateChange: changeDate,
    onDateInteract: trackDateFeatureUse,
  });
  const { scrollRef, dragHandlers, didDrag, scrollBy, resetScrollPosition } =
    useHorizontalDragScroll();

  const handleGameClick = (id) => {
    if (didDrag()) return; // suppress click if user dragged
    changeGame(id);
  };

  const gamesList = (games || []).map((g) => {
    const { isLive, isUpcoming } = parseGameStatus(g.status);
    const isSelected = g.id === selectedGameId;
    const gameClassName = `game${isSelected ? ' selected' : ''}`;
    const statusText = formatStatusText(g.status);

    if (!isUpcoming) {
      return (
        <div className={gameClassName} key={g.id} onClick={() => handleGameClick(g.id)}>
          <div className="iconRow">
            <TeamLogo team={g.awayteam} />
            {g.awayteam} - {g.hometeam}
            <TeamLogo team={g.hometeam} />
          </div>
          <div>
            {g.awayscore} - {g.homescore}
          </div>
          <div className="statusRow">
            <span className="statusText">{statusText}</span>
            {isLive && (
              <span className="liveDotIndicator" role="img" aria-label="Live game">
                <span className="liveDot" />
              </span>
            )}
          </div>
        </div>
      );
    } else {
      return (
        <div className={gameClassName} key={g.id} onClick={() => handleGameClick(g.id)}>
          <div className="iconRow">
            <TeamLogo team={g.awayteam} />
            {g.awayteam} - {g.hometeam}
            <TeamLogo team={g.hometeam} />
          </div>
          <div className="recordRow">
            {/* <span>{g.awayrecord}</span>
            <span>{g.homerecord}</span> */}
          </div>
          <div className="statusRow">
            <span className="statusText">{statusText}</span>
            {isLive && (
              <span className="liveDotIndicator" role="img" aria-label="Live game">
                <span className="liveDot" />
              </span>
            )}
          </div>
        </div>
      );
    }
  });
  const scrollScheduleRight = () => {
    scrollBy(100);
  };
  const scrollScheduleLeft = () => {
    scrollBy(-100);
  };

  useEffect(() => {
    const gamesNode = scrollRef.current;
    if (!gamesNode || !gamesList.length) {
      setCanScrollGames(false);
      return undefined;
    }

    const updateCanScrollGames = () => {
      const hasHorizontalOverflow = gamesNode.scrollWidth > gamesNode.clientWidth + 1;
      setCanScrollGames((prev) => (prev === hasHorizontalOverflow ? prev : hasHorizontalOverflow));
    };

    updateCanScrollGames();

    let resizeObserver;
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(updateCanScrollGames);
      resizeObserver.observe(gamesNode);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateCanScrollGames);
    }

    return () => {
      resizeObserver?.disconnect();
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', updateCanScrollGames);
      }
    };
  }, [games, gamesList.length, scrollRef]);

  const dateDown = () => {
    shiftDate(-DATE_NAVIGATION_STEP_DAYS);
    resetScrollPosition();
  };
  const dateUp = () => {
    shiftDate(DATE_NAVIGATION_STEP_DAYS);
    resetScrollPosition();
  };

  return (
    <div className="schedule">
      <div className="scheduleContent">
        <div className="datePick">
          <label className="visuallyHidden" htmlFor="scheduleDate">
            Select game date
          </label>
          <IconButton className="scheduleButton" onClick={dateDown} aria-label="Previous date">
            <NavigateBefore />
          </IconButton>
          <input
            id="scheduleDate"
            className="dateInput"
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
          />
          <IconButton className="scheduleButton" onClick={dateUp} aria-label="Next date">
            <NavigateNext />
          </IconButton>
        </div>
        <div className="gamePick">
          <IconButton
            className={`scheduleButton${canScrollGames ? '' : ' isHidden'}`}
            onClick={scrollScheduleLeft}
            aria-label="Scroll games left"
            aria-hidden={!canScrollGames}
            disabled={!canScrollGames}
            tabIndex={canScrollGames ? undefined : -1}
          >
            <NavigateBefore />
          </IconButton>
          {gamesList.length ? (
            <div className="gamesState">
              {isPending && (
                <span className="scheduleUpdating" role="status">
                  Updating games…
                </span>
              )}
              <div
                className="games"
                ref={scrollRef}
                onMouseDown={dragHandlers.onMouseDown}
                onMouseLeave={dragHandlers.onMouseLeave}
                onMouseUp={dragHandlers.onMouseUp}
                onMouseMove={dragHandlers.onMouseMove}
                onTouchStart={dragHandlers.onTouchStart}
                onTouchEnd={dragHandlers.onTouchEnd}
                onTouchCancel={dragHandlers.onTouchCancel}
                onTouchMove={dragHandlers.onTouchMove}
              >
                {gamesList}
              </div>
            </div>
          ) : isPending || isLoading ? (
            <div className="loadingIndicator">
              <CircularProgress size={24} thickness={5} />
              <span>Loading games...</span>
            </div>
          ) : status === 'error' ? (
            <div className="scheduleError" role="alert">
              <span>Couldn’t load games. {error?.message}</span>
              <button type="button" onClick={onRetry}>
                Retry
              </button>
            </div>
          ) : status === 'not-available' ? (
            <div className="scheduleError" role="status">
              <span>Schedule unavailable for this date.</span>
              <button type="button" onClick={onRetry}>
                Retry
              </button>
            </div>
          ) : status === 'success' ? (
            <div className="noGames">No Games Scheduled</div>
          ) : (
            <div className="loadingIndicator">
              <CircularProgress size={24} thickness={5} />
              <span>Loading games...</span>
            </div>
          )}
          <IconButton
            className={`scheduleButton end${canScrollGames ? '' : ' isHidden'}`}
            onClick={scrollScheduleRight}
            aria-label="Scroll games right"
            aria-hidden={!canScrollGames}
            disabled={!canScrollGames}
            tabIndex={canScrollGames ? undefined : -1}
          >
            <NavigateNext />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
