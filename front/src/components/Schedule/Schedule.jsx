import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarTodayOutlined,
  Close,
  ExpandMore,
  NavigateNext,
  NavigateBefore,
} from '@mui/icons-material';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import { parseGameStatus } from '../../domain/game-selection/status';
import { formatStatusText } from '../../helpers/utils';
import { formatPickerDate, formatShortDate } from '../../domain/game-selection/teamSchedule';
import { useDateInputState } from '../hooks/schedule/useDateInputState';
import { useHorizontalDragScroll } from '../hooks/ui/useHorizontalDragScroll';
import { useTrackFeatureUseOnce } from '../hooks/analytics/useTrackFeatureUseOnce';
import { useMinimumLoadingState } from '../hooks/ui/useMinimumLoadingState';
import { useStableWhileLoading } from '../hooks/ui/useStableWhileLoading';
import {
  LOADING_TEXT_DELAY_MS,
  MIN_BLUR_MS,
  MIN_DATE_SWITCH_BLUR_MS,
} from '../constants/loadingUiTimings';
import TeamLogo from './TeamLogo';
import TeamPickerPanel from './TeamPickerPanel';

import './Schedule.scss';

const DATE_NAVIGATION_STEP_DAYS = 1;
// Knockout and playoff games are scheduled before their teams are known.
const teamLabel = (team) => team || 'TBD';

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
  const dateText = formatShortDate(game.date, { weekday: true });
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

  // The native input sits invisibly over the "Wed, Nov 4" text, so open its
  // calendar from anywhere on the field rather than only from its own icon.
  const dateInputRef = useRef(null);
  const openDatePicker = () => {
    try {
      dateInputRef.current?.showPicker?.();
    } catch {
      // Unsupported or blocked; the focused input still accepts typed dates.
    }
  };

  const isTeamMode = Boolean(teamMode);
  const [isTeamPickerOpen, setIsTeamPickerOpen] = useState(false);
  const teamPickerTriggerRef = useRef(null);
  const teamPickerId = useId();
  const closeTeamPicker = useCallback(({ restoreFocus = false } = {}) => {
    setIsTeamPickerOpen(false);
    if (restoreFocus) teamPickerTriggerRef.current?.focus();
  }, []);
  const pickTeam = (abbr) => {
    setIsTeamPickerOpen(false);
    onSelectTeam?.(abbr, { source: 'team-picker' });
  };
  const teamPickerTriggerProps = {
    ref: teamPickerTriggerRef,
    type: 'button',
    onClick: () => setIsTeamPickerOpen((open) => !open),
    'aria-expanded': isTeamPickerOpen,
    'aria-controls': isTeamPickerOpen ? teamPickerId : undefined,
    'aria-haspopup': 'dialog',
  };

  // Switching to another date or team keeps the previous games on screen,
  // blurred, until the new list arrives (like the game panels below); switching
  // between the date and team views does the same for the whole schedule,
  // controls included. Live refreshes of the same list don't blur: a date's
  // list is only emptied when the date changes, and a team list only reloads
  // for a new team or season.
  const teamAbbr = teamMode?.team ?? null;
  const listMode = isTeamMode ? 'team' : 'date';
  // The other view's list is often already loaded, so a view change starts the
  // blur itself; the minimum blur time then covers the swap.
  const [lastListMode, setLastListMode] = useState(listMode);
  const [isModeSwitching, setIsModeSwitching] = useState(false);
  if (lastListMode !== listMode) {
    setLastListMode(listMode);
    setIsModeSwitching(true);
  }
  useEffect(() => {
    if (isModeSwitching) setIsModeSwitching(false);
  }, [isModeSwitching]);
  const isListSwitching =
    isModeSwitching ||
    (isTeamMode ? teamMode.status === 'loading' : Boolean(isPending && !games?.length));
  // A switch keeps the kind it started as (a date switch, or a team or view
  // switch), so its minimum blur time doesn't change partway through.
  const [isDateSwitch, setIsDateSwitch] = useState(!isTeamMode);
  const isListBlurred = useMinimumLoadingState(
    isListSwitching,
    isDateSwitch ? MIN_DATE_SWITCH_BLUR_MS : MIN_BLUR_MS,
  );
  const isStartingDateSwitch = !isTeamMode && !isModeSwitching;
  if (isListSwitching && !isListBlurred && isDateSwitch !== isStartingDateSwitch) {
    setIsDateSwitch(isStartingDateSwitch);
  }
  const liveView = useMemo(
    () =>
      isTeamMode
        ? {
            mode: 'team',
            team: teamAbbr,
            season: teamMode.season,
            record: teamMode.record,
            games: teamMode.games || [],
            isPending: teamMode.status === 'loading',
            isLoading: teamMode.status === 'loading',
            status: teamMode.status,
            error: teamMode.error,
            retry: teamMode.retry,
          }
        : {
            mode: 'date',
            date,
            games: games || [],
            isPending,
            isLoading: isPending || isLoading,
            status,
            error,
            retry: onRetry,
          },
    [isTeamMode, teamAbbr, teamMode, date, games, isPending, isLoading, status, error, onRetry],
  );
  const { displayData: stableView, isShowingStableData } = useStableWhileLoading({
    data: liveView,
    isLoading: isListSwitching,
    isBlurred: isListBlurred,
  });
  const isShowingPreviousView = isShowingStableData && stableView.mode !== listMode;
  const isShowingPreviousList =
    isShowingPreviousView || (isShowingStableData && stableView.games.length > 0);
  const shownList = isShowingPreviousList ? stableView : liveView;
  const shownHeader = isShowingPreviousView ? stableView : liveView;

  const [isSlowListSwitch, setIsSlowListSwitch] = useState(false);
  useEffect(() => {
    if (!isListSwitching) {
      setIsSlowListSwitch(false);
      return undefined;
    }
    const timer = setTimeout(() => setIsSlowListSwitch(true), LOADING_TEXT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isListSwitching]);

  const handleGameClick = (event, id) => {
    if (isShowingPreviousList) return;
    // Keyboard-generated clicks have no click count and should not inherit a
    // previous pointer drag's suppression state.
    if (event.detail > 0 && didDrag()) return;
    if (isTeamMode) {
      teamMode.changeGame(id);
      return;
    }
    changeGame(id);
  };

  const teamGamesList =
    shownList.mode === 'team'
      ? shownList.games.map((game) => (
          <TeamGameButton
            key={game.id}
            game={game}
            isSelected={game.id === selectedGameId}
            onClick={(event) => handleGameClick(event, game.id)}
          />
        ))
      : null;

  const dateGamesList = (shownList.mode === 'date' ? shownList.games : []).map((g) => {
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
        ? `${teamLabel(g.awayteam)} ${g.awayscore}, ${teamLabel(g.hometeam)} ${g.homescore}`
        : `${teamLabel(g.awayteam)} at ${teamLabel(g.hometeam)}`,
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
            {teamLabel(g.awayteam)} - {teamLabel(g.hometeam)}
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
            {teamLabel(g.awayteam)} - {teamLabel(g.hometeam)}
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
  const gamesList = shownList.mode === 'team' ? teamGamesList : dateGamesList;
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
  }, [shownList.games, gamesList.length, scrollRef]);

  const dateDown = () => {
    shiftDate(-DATE_NAVIGATION_STEP_DAYS);
  };
  const dateUp = () => {
    shiftDate(DATE_NAVIGATION_STEP_DAYS);
  };

  // The blurred previous list keeps its scroll position; the new games start
  // from the beginning once they replace it (before they are painted). A team
  // list then jumps to the selected game below.
  const wasShowingPreviousListRef = useRef(false);
  useLayoutEffect(() => {
    if (wasShowingPreviousListRef.current && !isShowingPreviousList) {
      resetScrollPosition();
    }
    wasShowingPreviousListRef.current = isShowingPreviousList;
  }, [isShowingPreviousList, resetScrollPosition]);

  // Team seasons are long: keep the selected game in view, jumping straight
  // there when the list is (re)built and gliding on ordinary selection changes.
  // Track the team whose games are on screen, which lags the chip while a
  // new team's list loads.
  const listTeam = shownList.mode === 'team' ? shownList.team : null;
  const listGameCount = shownList.mode === 'team' ? shownList.games.length : 0;
  const lastTeamListRef = useRef({ team: null, count: 0 });
  useLayoutEffect(() => {
    const previous = lastTeamListRef.current;
    lastTeamListRef.current = { team: listTeam, count: listGameCount };
    if (!listTeam) {
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

    const isListRebuilt = previous.team !== listTeam || previous.count !== listGameCount;
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
  }, [listTeam, listGameCount, selectedGameId, scrollRef, resetScrollPosition]);

  // The previous team's record would be wrong next to the new team's chip.
  const record = isShowingPreviousList && !isShowingPreviousView ? null : shownHeader.record;
  const recordText = record
    ? `${record.wins}-${record.losses}${record.seasonType === 'preseason' ? ' preseason' : ''}`
    : null;

  const {
    isPending: listIsPending,
    isLoading: listIsLoading,
    status: listStatus,
    error: listError,
    retry: listRetry,
  } = shownList;
  const isTeamList = shownList.mode === 'team';
  const unavailableText = isTeamList
    ? `No ${shownList.team} games found for ${shownList.season || 'this season'}.`
    : 'Schedule unavailable for this date.';
  const isTeamHeader = shownHeader.mode === 'team';
  const headerTeam = shownHeader.team;

  return (
    <div
      className={`schedule${isTeamHeader ? ' isTeamMode' : ''}`}
      role="region"
      aria-label={isTeamHeader ? `${headerTeam} schedule` : 'Game schedule'}
      aria-busy={isListSwitching || listIsPending || listIsLoading}
    >
      <div className={`scheduleContent${isShowingPreviousView ? ' isSwitchingView' : ''}`}>
        {isTeamHeader ? (
          <div className="datePick">
            <div className="teamChip">
              <button
                {...teamPickerTriggerProps}
                className="teamChipButton"
                aria-label={`Change team, now ${headerTeam}`}
                title="Change team"
              >
                <TeamLogo team={headerTeam} size={28} />
                <div className="teamChipText">
                  <span className="teamChipName">{headerTeam}</span>
                  <span className="teamChipMeta">
                    {[recordText, shownHeader.season].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </button>
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
            <div className="dateField">
              <span className="dateFieldText" aria-hidden="true">
                {formatPickerDate(shownHeader.date)}
              </span>
              <CalendarTodayOutlined className="dateFieldIcon" aria-hidden="true" />
              <input
                id="scheduleDate"
                ref={dateInputRef}
                className="dateInput"
                type="date"
                value={shownHeader.date}
                onChange={(e) => handleDateChange(e.target.value)}
                onClick={openDatePicker}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openDatePicker();
                  }
                }}
              />
            </div>
            <IconButton className="scheduleButton" onClick={dateUp} aria-label="Next date">
              <NavigateNext />
            </IconButton>
            {onSelectTeam && (
              <button {...teamPickerTriggerProps} className="teamPickerTrigger">
                Teams
                <ExpandMore fontSize="small" aria-hidden="true" />
              </button>
            )}
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
              {(isShowingPreviousList ? isSlowListSwitch : listIsPending) && (
                <span className="scheduleUpdating" role="status">
                  Updating games…
                </span>
              )}
              <div
                className={`games${isShowingPreviousList ? ' isLoading' : ''}`}
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
            <div className="noGames">{isTeamList ? unavailableText : 'No Games Scheduled'}</div>
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
      {isTeamPickerOpen && (
        <TeamPickerPanel
          id={teamPickerId}
          selectedTeam={teamAbbr}
          onSelect={pickTeam}
          onClose={closeTeamPicker}
          triggerRef={teamPickerTriggerRef}
        />
      )}
    </div>
  );
}
