import { useEffect, useRef, useState } from 'react';
import { Close, NavigateNext, NavigateBefore } from '@mui/icons-material';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import { ASSET_PREFIX } from '../../environment';
import { parseGameStatus } from '../../domain/game-selection/status';
import { formatStatusText } from '../../helpers/utils';
import { formatShortDate } from '../../domain/game-selection/teamSchedule';
import { useDateInputState } from '../hooks/schedule/useDateInputState';
import { useHorizontalDragScroll } from '../hooks/ui/useHorizontalDragScroll';
import { useTrackFeatureUseOnce } from '../hooks/analytics/useTrackFeatureUseOnce';
import { useLoadedImage } from '../hooks/ui/useLoadedImage';

import './Schedule.scss';

const LOGO_BASE_PATH = `${ASSET_PREFIX ? ASSET_PREFIX : ''}/img/teams`;
const buildLogoSrc = (team) => `${LOGO_BASE_PATH}/${team}.svg`;
const DATE_NAVIGATION_STEP_DAYS = 1;

function TeamLogo({ team, size = 16 }) {
  const { isLoaded, imgProps } = useLoadedImage(team ? buildLogoSrc(team) : null);

  if (!team) return null;

  return (
    <div className={`teamLogoWrapper${!isLoaded ? ' isPending' : ''}`}>
      <img
        {...imgProps}
        height={size}
        width={size}
        draggable={false}
        loading="lazy"
        className="teamLogo"
        alt=""
        aria-hidden="true"
      />
    </div>
  );
}

function LiveDot() {
  return (
    <span className="liveDotIndicator" role="img" aria-label="Live game">
      <span className="liveDot" />
    </span>
  );
}

function TeamGameButton({ game, isSelected, onClick }) {
  const { isLive, isUpcoming } = parseGameStatus(game.status);
  const hasScore = !isUpcoming && game.teamScore !== null && game.oppScore !== null;
  const dateText = formatShortDate(game.date);
  const statusText = formatStatusText(game.status);
  const scoreText = hasScore ? `${game.teamScore}-${game.oppScore}` : '';
  const outcomeText =
    game.result && hasScore ? `${game.result} ${scoreText}` : isLive ? scoreText : statusText;
  const label = [
    dateText,
    `${game.isHome ? 'vs' : 'at'} ${game.opponent}`,
    outcomeText,
    isLive ? statusText : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      type="button"
      className={`game teamGame${isSelected ? ' selected' : ''}`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={isSelected}
      data-game-id={game.id}
    >
      <div className="dateRow">{dateText}</div>
      <div className="iconRow">
        <TeamLogo team={game.team} />
        <span className="matchupPrefix">{game.isHome ? 'vs' : '@'}</span>
        <TeamLogo team={game.opponent} />
        {game.opponent}
      </div>
      <div className="statusRow">
        <span className={`statusText${game.result ? ` result${game.result}` : ''}`}>
          {isLive ? [scoreText, statusText].filter(Boolean).join(' · ') : outcomeText}
        </span>
        {isLive && <LiveDot />}
      </div>
    </button>
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
  onSelectTeam,
  teamMode = null,
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

  const isTeamMode = Boolean(teamMode);
  const handleGameClick = (event, id) => {
    // Keyboard-generated clicks have no click count and should not inherit a
    // previous pointer drag's suppression state.
    if (event.detail > 0 && didDrag()) return;
    if (isTeamMode) {
      teamMode.changeGame(id);
      return;
    }
    changeGame(id);
  };

  const teamGamesList = isTeamMode
    ? teamMode.games.map((game) => (
        <TeamGameButton
          key={game.id}
          game={game}
          isSelected={game.id === selectedGameId}
          onClick={(event) => handleGameClick(event, game.id)}
        />
      ))
    : null;

  const dateGamesList = (isTeamMode ? [] : games || []).map((g) => {
    const { isLive, isUpcoming } = parseGameStatus(g.status);
    const isSelected = g.id === selectedGameId;
    const gameClassName = `game${isSelected ? ' selected' : ''}`;
    const statusText = formatStatusText(g.status);
    const hasScore =
      g.awayscore !== null &&
      g.awayscore !== undefined &&
      g.homescore !== null &&
      g.homescore !== undefined;
    const gameLabel = [
      !isUpcoming && hasScore
        ? `${g.awayteam} ${g.awayscore}, ${g.hometeam} ${g.homescore}`
        : `${g.awayteam} at ${g.hometeam}`,
      statusText,
    ]
      .filter(Boolean)
      .join(', ');

    if (!isUpcoming) {
      return (
        <button
          type="button"
          className={gameClassName}
          key={g.id}
          onClick={(event) => handleGameClick(event, g.id)}
          aria-label={gameLabel}
          aria-pressed={isSelected}
        >
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
            {isLive && <LiveDot />}
          </div>
        </button>
      );
    } else {
      return (
        <button
          type="button"
          className={gameClassName}
          key={g.id}
          onClick={(event) => handleGameClick(event, g.id)}
          aria-label={gameLabel}
          aria-pressed={isSelected}
        >
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
            {isLive && <LiveDot />}
          </div>
        </button>
      );
    }
  });
  const gamesList = isTeamMode ? teamGamesList : dateGamesList;
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

  // Team seasons are long: keep the selected game in view, jumping straight
  // there when the list is (re)built and gliding on ordinary selection changes.
  const teamAbbr = teamMode?.team ?? null;
  const teamGameCount = teamMode?.games.length ?? 0;
  const lastTeamListRef = useRef({ team: null, count: 0 });
  useEffect(() => {
    const previous = lastTeamListRef.current;
    lastTeamListRef.current = { team: teamAbbr, count: teamGameCount };
    if (!teamAbbr) {
      if (previous.team) {
        resetScrollPosition();
      }
      return;
    }
    const node = scrollRef.current;
    if (!node || !selectedGameId) return;
    const element = Array.from(node.children).find(
      (child) => child.dataset?.gameId === selectedGameId,
    );
    if (!element) return;

    const isListRebuilt = previous.team !== teamAbbr || previous.count !== teamGameCount;
    const nodeRect = node.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const isVisible = elementRect.left >= nodeRect.left && elementRect.right <= nodeRect.right;
    if (isVisible && !isListRebuilt) return;

    const left =
      node.scrollLeft + elementRect.left - nodeRect.left - (nodeRect.width - elementRect.width) / 2;
    if (typeof node.scrollTo === 'function') {
      node.scrollTo({ left, behavior: isListRebuilt ? 'auto' : 'smooth' });
    } else {
      node.scrollLeft = left;
    }
  }, [teamAbbr, teamGameCount, selectedGameId, scrollRef, resetScrollPosition]);

  const record = teamMode?.record;
  const recordText = record
    ? `${record.wins}-${record.losses}${record.seasonType === 'preseason' ? ' preseason' : ''}`
    : null;

  const listIsPending = isTeamMode ? teamMode.status === 'loading' : isPending;
  const listIsLoading = isTeamMode ? teamMode.status === 'loading' : isPending || isLoading;
  const listStatus = isTeamMode ? teamMode.status : status;
  const listError = isTeamMode ? teamMode.error : error;
  const listRetry = isTeamMode ? teamMode.retry : onRetry;
  const unavailableText = isTeamMode
    ? `No ${teamAbbr} games found for ${teamMode.season || 'this season'}.`
    : 'Schedule unavailable for this date.';

  return (
    <div
      className={`schedule${isTeamMode ? ' isTeamMode' : ''}`}
      role="region"
      aria-label={isTeamMode ? `${teamAbbr} schedule` : 'Game schedule'}
      aria-busy={listIsPending || listIsLoading}
    >
      <div className="scheduleContent">
        {isTeamMode ? (
          <div className="datePick">
            <div className="teamChip">
              <TeamLogo team={teamAbbr} size={28} />
              <div className="teamChipText">
                <span className="teamChipName">{teamAbbr}</span>
                <span className="teamChipMeta">
                  {[recordText, teamMode.season].filter(Boolean).join(' · ')}
                </span>
              </div>
              <IconButton
                className="teamChipClear"
                size="small"
                onClick={() => onSelectTeam?.(null)}
                aria-label="Show all games"
                title="Show all games"
              >
                <Close fontSize="small" />
              </IconButton>
            </div>
          </div>
        ) : (
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
        )}
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
              {listIsPending && (
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
          ) : listIsLoading ? (
            <div className="loadingIndicator" role="status">
              <CircularProgress size={24} thickness={5} />
              <span>Loading games...</span>
            </div>
          ) : listStatus === 'error' ? (
            <div className="scheduleError" role="alert">
              <span>Couldn’t load games. {listError?.message}</span>
              <button type="button" onClick={listRetry}>
                Retry
              </button>
            </div>
          ) : listStatus === 'not-available' ? (
            <div className="scheduleError" role="status">
              <span>{unavailableText}</span>
              <button type="button" onClick={listRetry}>
                Retry
              </button>
            </div>
          ) : listStatus === 'success' ? (
            <div className="noGames">{isTeamMode ? unavailableText : 'No Games Scheduled'}</div>
          ) : (
            <div className="loadingIndicator" role="status">
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
