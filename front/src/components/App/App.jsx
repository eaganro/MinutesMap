import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { sortActions, filterActions, processScoreTimeline, createPlayers,
  createPlaytimes, updatePlaytimesWithAction, quarterChange, endPlaytimes } from '../../helpers/dataProcessing';
import { getTodayString, sortGamesForSelection } from '../../helpers/gameSelectionUtils';
import { 
  useQueryParams, 
  useLocalStorageState, 
  useGameData, 
  useWebSocket,
  useAutoSelectGame 
} from '../hooks';
import { PREFIX } from '../../environment';

import CircularProgress from '@mui/material/CircularProgress';

import Schedule from '../Schedule/Schedule';
import Score from '../Score/Score';
import Boxscore from '../Boxscore/Boxscore';
import Play from '../Play/Play';
import StatButtons from '../StatButtons/StatButtons';
import DarkModeToggle from '../DarkModeToggle/DarkModeToggle';

import './App.scss';

const DEFAULT_STAT_ON = [true, false, true, true, false, false, false, false];

export default function App() {
  const { getInitialParams, updateQueryParams } = useQueryParams();
  const initialParams = useMemo(() => getInitialParams(), []);
  const today = useMemo(() => getTodayString(), []);

  // Date & game selection state
  const [date, setDate] = useState(initialParams.date || today);
  const [games, setGames] = useState([]);
  const [gameId, setGameId] = useState(initialParams.gameId || null);
  const [isScheduleLoading, setIsScheduleLoading] = useState(true);

  // Game data hook
  const {
    box,
    playByPlay,
    awayTeamId,
    homeTeamId,
    numQs,
    lastAction,
    gameStatusMessage,
    isBoxLoading,
    isPlayLoading,
    isPlayRefreshing,
    fetchBoth,
    fetchPlayByPlay,
    fetchBox,
    resetLoadingStates,
  } = useGameData();

  // Processed play data state
  const [awayActions, setAwayActions] = useState([]);
  const [homeActions, setHomeActions] = useState([]);
  const [allActions, setAllActions] = useState([]);
  const [scoreTimeline, setScoreTimeline] = useState([]);
  const [homePlayerTimeline, setHomePlayerTimeline] = useState([]);
  const [awayPlayerTimeline, setAwayPlayerTimeline] = useState([]);

  // UI preferences (persisted to localStorage)
  const [statOn, setStatOn] = useLocalStorageState('statOn', DEFAULT_STAT_ON);
  const [showScoreDiff, setShowScoreDiff] = useLocalStorageState('showScoreDiff', true);
  
  // UI state
  const [showLoading, setShowLoading] = useState(false);
  const [playByPlaySectionWidth, setPlayByPlaySectionWidth] = useState(0);

  // Ref for gameId (needed for WebSocket callbacks)
  const latestGameIdRef = useRef(gameId);
  useEffect(() => { latestGameIdRef.current = gameId; }, [gameId]);

  // Auto-select game hook
  const { attemptAutoSelect, disableAutoSelect } = useAutoSelectGame({
    initialDate: initialParams.date || today,
    initialGameId: initialParams.gameId,
    date,
    gameId,
    onSelectGame: setGameId,
    onLookbackDate: (newDate) => {
      setIsScheduleLoading(true);
      setDate(newDate);
    },
  });

  // WebSocket event handlers
  const handlePlayByPlayUpdate = useCallback((key, version) => {
    const url = `${PREFIX}/${encodeURIComponent(key)}?v=${version}`;
    fetchPlayByPlay(url, latestGameIdRef.current, () => wsClose());
  }, [fetchPlayByPlay]);

  const handleBoxUpdate = useCallback((key, version) => {
    const url = `${PREFIX}/${encodeURIComponent(key)}?v=${version}`;
    fetchBox(url);
  }, [fetchBox]);

  const handleDateUpdate = useCallback((data, scheduleDate) => {
    setGames(data);
    setIsScheduleLoading(false);
    attemptAutoSelect(data, scheduleDate);
  }, [attemptAutoSelect]);

  // WebSocket hook
  const { close: wsClose } = useWebSocket({
    gameId,
    date,
    onPlayByPlayUpdate: handlePlayByPlayUpdate,
    onBoxUpdate: handleBoxUpdate,
    onDateUpdate: handleDateUpdate,
  });

  // Process play-by-play data into actions and timelines
  const processPlayData = useCallback((data) => {
    if (data.length === 0) {
      setAwayPlayerTimeline([]);
      setHomePlayerTimeline([]);
      setScoreTimeline([]);
      setAllActions([]);
      setAwayActions([]);
      setHomeActions([]);
      return;
    }
    
    setScoreTimeline(processScoreTimeline(data));

    let { awayPlayers, homePlayers } = createPlayers(data, awayTeamId, homeTeamId);
    let awayPlaytimes = createPlaytimes(awayPlayers);
    let homePlaytimes = createPlaytimes(homePlayers);

    let currentQ = 1;
    data.forEach(a => {
      if (a.period !== currentQ) {
        awayPlaytimes = quarterChange(awayPlaytimes);
        homePlaytimes = quarterChange(homePlaytimes);
        currentQ = a.period;
      }
      if (a.teamId === awayTeamId) {
        awayPlaytimes = updatePlaytimesWithAction(a, awayPlaytimes);
      }
      if (a.teamId === homeTeamId) {
        homePlaytimes = updatePlaytimesWithAction(a, homePlaytimes);
      }
    });
    
    homePlaytimes = endPlaytimes(homePlaytimes, lastAction);
    awayPlaytimes = endPlaytimes(awayPlaytimes, lastAction);
    setAwayPlayerTimeline(awayPlaytimes);
    setHomePlayerTimeline(homePlaytimes);

    let allAct = [];
    Object.entries(awayPlayers).forEach(([name, actions]) => {
      allAct = [...allAct, ...actions];
      awayPlayers[name] = awayPlayers[name].filter((a) => filterActions(a, statOn));
    });
    Object.entries(homePlayers).forEach(([name, actions]) => {
      allAct = [...allAct, ...actions];
      homePlayers[name] = homePlayers[name].filter((a) => filterActions(a, statOn));
    });
    allAct = sortActions(allAct);
    
    setAllActions(allAct);
    setAwayActions(awayPlayers);
    setHomeActions(homePlayers);
  }, [awayTeamId, homeTeamId, lastAction, statOn]);

  // Event handlers
  const changeDate = useCallback((e) => {
    const newDate = e.target.value;
    if (newDate === date) return;
    
    disableAutoSelect();
    setIsScheduleLoading(true);
    setDate(newDate);
    updateQueryParams(newDate, gameId);
  }, [date, gameId, updateQueryParams, disableAutoSelect]);

  const changeGame = useCallback((id) => {
    disableAutoSelect();
    
    if (!id || id === gameId) {
      updateQueryParams(date, id || gameId);
      return;
    }
    
    resetLoadingStates();
    setGameId(id);
    updateQueryParams(date, id);
  }, [date, gameId, updateQueryParams, resetLoadingStates, disableAutoSelect]);

  const changeStatOn = useCallback((index) => {
    setStatOn(prev => {
      const updated = [...prev];
      updated[index] = !updated[index];
      return updated;
    });
  }, [setStatOn]);

  // Sync URL on initial mount
  useEffect(() => {
    updateQueryParams(date, gameId);
  }, []);

  // Handle date changes - update URL
  useEffect(() => {
    updateQueryParams(date, gameId);
  }, [date]);

  // Handle game changes - fetch data and update URL
  useEffect(() => {
    if (!gameId) {
      updateQueryParams(date, gameId);
      return;
    }
    fetchBoth(gameId);
    updateQueryParams(date, gameId);
  }, [gameId]);

  // Process play data when it changes
  useEffect(() => {
    processPlayData(playByPlay);
  }, [playByPlay, statOn]);

  // Delay loading indicator to avoid flash
  useEffect(() => {
    const isLoading = isBoxLoading || isPlayLoading || isScheduleLoading;
    if (isLoading) {
      const timer = setTimeout(() => setShowLoading(true), 500);
      return () => clearTimeout(timer);
    } else {
      setShowLoading(false);
    }
  }, [isBoxLoading, isPlayLoading, isScheduleLoading]);

  // Track play-by-play section width for responsive layout
  const playByPlaySectionRef = useRef();
  useEffect(() => {
    const element = playByPlaySectionRef.current;
    if (!element) return;
    
    const observer = new ResizeObserver(entries => {
      setPlayByPlaySectionWidth(entries[0].contentRect.width);
    });
    observer.observe(element);
    return () => observer.unobserve(element);
  }, []);

  // Computed values
  const awayTeamName = useMemo(() => ({
    name: box?.awayTeam?.teamName || 'Away Team',
    abr: box?.awayTeam?.teamTricode || '',
  }), [box?.awayTeam]);

  const homeTeamName = useMemo(() => ({
    name: box?.homeTeam?.teamName || 'Home Team',
    abr: box?.homeTeam?.teamTricode || '',
  }), [box?.homeTeam]);

  const isGameDataLoading = (isBoxLoading || isPlayLoading) && showLoading;
  const sortedGamesForSchedule = useMemo(() => sortGamesForSelection(games), [games]);

  return (
    <div className='topLevel'>
      <header className='appHeader'>
        <div className='appBranding'>
          <img src="/logo.png" alt="CourtVision logo" className='appLogo' />
          <span className='appName'>CourtVision</span>
        </div>
        <DarkModeToggle />
      </header>
      
      <Schedule
        games={sortedGamesForSchedule}
        date={date}
        changeDate={changeDate}
        changeGame={changeGame}
        isLoading={isScheduleLoading && showLoading}
        selectedGameId={gameId}
      />
      
      <Score
        homeTeam={box?.homeTeam?.teamTricode}
        awayTeam={box?.awayTeam?.teamTricode}
        score={scoreTimeline[scoreTimeline.length - 1]}
        date={box.gameEt}
        changeDate={changeDate}
        isLoading={isGameDataLoading}
        statusMessage={gameStatusMessage}
      />
      
      <div className='playByPlaySection' ref={playByPlaySectionRef}>
        {isPlayRefreshing && (
          <div className='dataRefresh' role='status' aria-label='Updating data'>
            <CircularProgress size={14} thickness={4} />
          </div>
        )}
        <Play
          awayTeamNames={awayTeamName}
          homeTeamNames={homeTeamName}
          awayPlayers={awayActions}
          homePlayers={homeActions}
          allActions={allActions}
          scoreTimeline={scoreTimeline}
          awayPlayerTimeline={awayPlayerTimeline}
          homePlayerTimeline={homePlayerTimeline}
          numQs={numQs}
          sectionWidth={playByPlaySectionWidth}
          lastAction={lastAction}
          isLoading={isPlayLoading && showLoading}
          statusMessage={gameStatusMessage}
          showScoreDiff={showScoreDiff}
        />
        <StatButtons
          statOn={statOn}
          changeStatOn={changeStatOn}
          showScoreDiff={showScoreDiff}
          setShowScoreDiff={setShowScoreDiff}
          isLoading={isPlayLoading && showLoading}
          statusMessage={gameStatusMessage}
        />
      </div>
      
      <Boxscore 
        box={box} 
        isLoading={isBoxLoading && showLoading} 
        statusMessage={gameStatusMessage} 
      />
    </div>
  );
}
