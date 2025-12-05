import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fixPlayerName } from '../../helpers/utils';
import { sortActions, filterActions, processScoreTimeline, createPlayers,
  createPlaytimes, updatePlaytimesWithAction, quarterChange, endPlaytimes } from '../../helpers/dataProcessing';

import CircularProgress from '@mui/material/CircularProgress';

import Schedule from '../Schedule/Schedule';
import Score from '../Score/Score';
import Boxscore from '../Boxscore/Boxscore';
import Play from '../Play/Play';
import StatButtons from '../StatButtons/StatButtons';
import DarkModeToggle from '../DarkModeToggle/DarkModeToggle';

import { wsLocation, PREFIX } from '../../environment';

import './App.scss';

const MAX_AUTO_LOOKBACK_DAYS = 10;
const GAME_NOT_STARTED_MESSAGE = 'Game data is not available yet. The game has not started.';

const formatDateString = (dateObj) => {
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${dateObj.getFullYear()}-${month}-${day}`;
};

const shiftDateString = (dateString, offset) => {
  if (!dateString) {
    return null;
  }
  const base = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(base.getTime())) {
    return null;
  }
  base.setDate(base.getDate() + offset);
  return formatDateString(base);
};

const compareGamesForSelection = (a, b) => {
  const statusA = (a?.status || '').trim();
  const statusB = (b?.status || '').trim();
  const timeA = new Date(a?.starttime || '').getTime();
  const timeB = new Date(b?.starttime || '').getTime();
  const safeTimeA = Number.isFinite(timeA) ? timeA : 0;
  const safeTimeB = Number.isFinite(timeB) ? timeB : 0;

  const finalA = statusA.startsWith('Final');
  const finalB = statusB.startsWith('Final');
  const upcomingA = statusA.endsWith('ET');
  const upcomingB = statusB.endsWith('ET');
  const liveA = !!statusA && !finalA && !upcomingA;
  const liveB = !!statusB && !finalB && !upcomingB;

  const bucketA = liveA ? 0 : (upcomingA ? 1 : (finalA ? 2 : 1));
  const bucketB = liveB ? 0 : (upcomingB ? 1 : (finalB ? 2 : 1));
  if (bucketA < bucketB) return -1;
  if (bucketA > bucketB) return 1;

  if (bucketA === 2) {
    if (safeTimeA < safeTimeB) return -1;
    if (safeTimeA > safeTimeB) return 1;
  } else {
    if (safeTimeA < safeTimeB) return -1;
    if (safeTimeA > safeTimeB) return 1;
  }

  if ((a?.hometeam || '') > (b?.hometeam || '')) return 1;
  if ((a?.hometeam || '') < (b?.hometeam || '')) return -1;
  return 0;
};

const sortGamesForSelection = (games = []) => [...games].sort(compareGamesForSelection);

const findFirstStartedOrCompletedGame = (games = [], alreadySorted = false) => {
  const list = alreadySorted ? games : sortGamesForSelection(games);
  return list.find((game) => {
    const status = (game?.status || '').trim();
    return status && !status.endsWith('ET');
  }) || null;
};

export default function App() {

  let today = new Date();
  today.setDate(today.getDate());
  let month = today.getMonth() + 1;
  if (month < 10) {
    month = '0' + month;
  }
  let day = today.getDate();
  if (day < 10) {
    day = '0' + day;
  }
  let val = `${today.getFullYear()}-${month}-${day}`

  // Read optional query params on load
  const initialParams = new URLSearchParams(window.location.search);
  const initialDate = initialParams.get('date') || val;
  const initialGameIdParam = initialParams.get('gameid');

  const [date, setDate] = useState(initialDate);
  const [games, setGames] = useState([]);
  const [isScheduleLoading, setIsScheduleLoading] = useState(true);
  const [box, setBox] = useState({});
  const [playByPlay, setPlayByPlay] = useState([]);
  // const [gameId, setGameId] = useState("0022300216");
  const [gameId, setGameId] = useState(initialGameIdParam || null);
  const [shouldAutoSelectGame, setShouldAutoSelectGame] = useState(!initialGameIdParam);
  const [awayTeamId, setAwayTeamId] = useState(null);
  const [homeTeamId, setHomeTeamId] = useState(null);

  const [awayActions, setAwayActions] = useState([]);
  const [homeActions, setHomeActions] = useState([]);

  const [allActions, setAllActions] = useState([]);

  const [scoreTimeline, setScoreTimeline] = useState([]);
  const [homePlayerTimeline, setHomePlayerTimeline] = useState([]);
  const [awayPlayerTimeline, setAwayPlayerTimeline] = useState([]);
  const [gameStatusMessage, setGameStatusMessage] = useState(null);

  const [isBoxLoading, setIsBoxLoading] = useState(true);
  const [isPlayLoading, setIsPlayLoading] = useState(true);
  const [isPlayRefreshing, setIsPlayRefreshing] = useState(false);
  const [showLoading, setShowLoading] = useState(false);

  const latestBoxRef = useRef(box);
  const latestPlayByPlayRef = useRef(playByPlay);


  const [playByPlaySectionWidth, setPlayByPlaySectionWidth] = useState(0);



  const [statOn, setStatOn] = useState(() => {
    const saved = localStorage.getItem('statOn');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [true, false, true, true, false, false, false, false];
      }
    }
    return [true, false, true, true, false, false, false, false];
  });
  const [showScoreDiff, setShowScoreDiff] = useState(() => {
    const saved = localStorage.getItem('showScoreDiff');
    if (saved !== null) {
      try {
        return JSON.parse(saved);
      } catch {
        return true;
      }
    }
    return true;
  });
  const [numQs, setNumQs] = useState(4);
  const [lastAction, setLastAction] = useState(null);
  const [selectionRangeSecs, setSelectionRangeSecs] = useState(null);

  const [ws, setWs] = useState(null);

  const latestDateRef = useRef(date);
  const latestGameIdRef = useRef(gameId);
  const autoSelectActiveRef = useRef(!initialGameIdParam);
  const autoSelectVisitedDatesRef = useRef(new Set(initialDate ? [initialDate] : []));
  const autoSelectAttemptsRef = useRef(0);
  const attemptAutoSelectGameRef = useRef(() => {});

  const connect = () => {
    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const newWs = new WebSocket(wsLocation);
    setWs(newWs);

    newWs.onopen = () => {
      console.log('Connected to WebSocket');
      if (gameId) {
        newWs.send(JSON.stringify({ action: 'followGame', gameId }));
      }
      newWs.send(JSON.stringify({ action: 'followDate', date }));
    };

    newWs.onmessage = async (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (err) {
        console.error("Malformed WS message", event.data, err);
        return;
      }
    
      try {
        if (msg.key?.includes("playByPlayData")) {
          const url = `${PREFIX}/${encodeURIComponent(msg.key)}?v=${msg.version}`;
          getPlayByPlay(url);
        } else if (msg.key?.includes("boxData")) {
          const url = `${PREFIX}/${encodeURIComponent(msg.key)}?v=${msg.version}`;
          getBox(url);
        } else if (msg.type === "date") {
          setGames(msg.data);
          setIsScheduleLoading(false);
          attemptAutoSelectGameRef.current(msg.data, msg.date);
        }
      } catch (err) {
        console.error("Error handling WS message", msg, err);
      }
    };

    newWs.onclose = () => {
      console.log('Disconnected from WebSocket');
    };

  };

  useEffect(() => {
    connect();
    // return () => ws?.close();
  }, []);

  useEffect(() => {
    latestDateRef.current = date;
  }, [date]);

  useEffect(() => {
    latestGameIdRef.current = gameId;
  }, [gameId]);

  useEffect(() => {
    autoSelectActiveRef.current = shouldAutoSelectGame;
  }, [shouldAutoSelectGame]);

  attemptAutoSelectGameRef.current = (incomingGames, scheduleDate) => {
    const gamesList = Array.isArray(incomingGames) ? incomingGames : [];
    const effectiveDate = scheduleDate || latestDateRef.current;
    if (effectiveDate) {
      autoSelectVisitedDatesRef.current.add(effectiveDate);
    }

    if (!autoSelectActiveRef.current) {
      return;
    }

    const sortedGames = sortGamesForSelection(gamesList);
    const firstStartedOrCompleted = findFirstStartedOrCompletedGame(sortedGames, true);
    if (firstStartedOrCompleted) {
      autoSelectActiveRef.current = false;
      setShouldAutoSelectGame(false);
      if (latestGameIdRef.current !== firstStartedOrCompleted.id) {
        setGameId(firstStartedOrCompleted.id);
      }
      return;
    }

    if (!effectiveDate) {
      autoSelectActiveRef.current = false;
      setShouldAutoSelectGame(false);
      const fallbackGame = sortedGames[0];
      if (!latestGameIdRef.current && fallbackGame) {
        setGameId(fallbackGame.id);
      }
      return;
    }

    if (autoSelectAttemptsRef.current >= MAX_AUTO_LOOKBACK_DAYS) {
      autoSelectActiveRef.current = false;
      setShouldAutoSelectGame(false);
      const fallbackGame = sortedGames[0];
      if (!latestGameIdRef.current && fallbackGame) {
        setGameId(fallbackGame.id);
      }
      return;
    }

    const previousDate = shiftDateString(effectiveDate, -1);
    if (!previousDate || autoSelectVisitedDatesRef.current.has(previousDate)) {
      autoSelectActiveRef.current = false;
      setShouldAutoSelectGame(false);
      const fallbackGame = sortedGames[0];
      if (!latestGameIdRef.current && fallbackGame) {
        setGameId(fallbackGame.id);
      }
      return;
    }

    autoSelectAttemptsRef.current += 1;
    autoSelectVisitedDatesRef.current.add(previousDate);
    setIsScheduleLoading(true);
    setDate(previousDate);
  };

  useEffect(() => {
    latestBoxRef.current = box;
  }, [box]);

  useEffect(() => {
    latestPlayByPlayRef.current = playByPlay;
  }, [playByPlay]);

  // Keep query params in sync when date or game changes
  const updateQueryParams = useCallback((newDate, newGameId) => {
    const params = new URLSearchParams(window.location.search);
    if (newDate) {
      params.set('date', newDate);
    } else {
      params.delete('date');
    }
    if (newGameId) {
      params.set('gameid', newGameId);
    } else {
      params.delete('gameid');
    }
    const query = params.toString();
    const newUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', newUrl);
  }, []);

  // On initial mount, ensure URL reflects initial state
  useEffect(() => {
    updateQueryParams(date, gameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'followDate', date }));
    } else if (ws !== null) {
      connect();
    }
    updateQueryParams(date, gameId);
  }, [date]);

  useEffect(() => {
    if (!gameId) {
      updateQueryParams(date, gameId);
      return;
    }

    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'followGame', gameId }));
    } else if (ws !== null) {
      connect();
    }
    getBoth();
    updateQueryParams(date, gameId);
  }, [gameId]);



  useEffect(() => {
    processPlayData(playByPlay);
  }, [playByPlay, statOn]);

  useEffect(() => {
    localStorage.setItem('statOn', JSON.stringify(statOn));
  }, [statOn]);

  useEffect(() => {
    localStorage.setItem('showScoreDiff', JSON.stringify(showScoreDiff));
  }, [showScoreDiff]);

  // Delay showing loading indicator by 500ms to avoid flashing for fast loads
  useEffect(() => {
    const isLoading = isBoxLoading || isPlayLoading || isScheduleLoading;
    if (isLoading) {
      const timer = setTimeout(() => {
        setShowLoading(true);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setShowLoading(false);
    }
  }, [isBoxLoading, isPlayLoading, isScheduleLoading]);

  const getBoth = async () => {
    const boxUrl  = `${PREFIX}/data/boxData/${gameId}.json.gz`;
    const playUrl = `${PREFIX}/data/playByPlayData/${gameId}.json.gz`;

    setIsBoxLoading(true);
    setIsPlayLoading(true);
    setIsPlayRefreshing(false);
    setGameStatusMessage(null);

    try {
      const [boxRes, playResRaw] = await Promise.all([
        fetch(boxUrl),
        fetch(playUrl),
      ]);

      if (boxRes.status === 403 || boxRes.status === 404) {
        setGameStatusMessage(GAME_NOT_STARTED_MESSAGE);
        setBox({});
        setAwayTeamId(null);
        setHomeTeamId(null);
        setPlayByPlay([]);
        setLastAction(null);
        setNumQs(4);
        setIsBoxLoading(false);
        setIsPlayLoading(false);
        return;
      }

      if (!boxRes.ok) throw new Error(`S3 fetch failed: ${boxRes.status}`);
      const box = await boxRes.json();
      setBox(box);
      setAwayTeamId(box.awayTeamId ?? box.awayTeam.teamId);
      setHomeTeamId(box.homeTeamId ?? box.homeTeam.teamId);
      setIsBoxLoading(false);

      if (playResRaw.status === 403) {
        setGameStatusMessage(GAME_NOT_STARTED_MESSAGE);
        setPlayByPlay([]);
        setLastAction(null);
        setNumQs(4);
        setIsPlayLoading(false);
        return;
      }

      if (playResRaw.status === 404) {
        setPlayByPlay([]);
        setLastAction(null);
        setNumQs(4);
        setIsPlayLoading(false);
        return;
      }

      if (!playResRaw.ok) throw new Error(`S3 fetch failed: ${playResRaw.status}`);
      const play = await playResRaw.json();
      if (play) {
        const last = play[play.length - 1] || null;
        setNumQs(last?.period > 4 ? last?.period : 4);
        setLastAction(last);
        setPlayByPlay(play);
      }
      setIsPlayLoading(false);
    } catch (err) {
      console.error('Error in getBoth:', err);
      setIsBoxLoading(false);
      setIsPlayLoading(false);
    }
  };

  const getPlayByPlay = async (url) => {
    const hasExistingData = latestPlayByPlayRef.current.length > 0;
    if (hasExistingData) {
      setIsPlayRefreshing(true);
    } else {
      setIsPlayLoading(true);
    }

    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 403) {
          setGameStatusMessage(GAME_NOT_STARTED_MESSAGE);
          setPlayByPlay([]);
          setLastAction(null);
          setNumQs(4);
          setIsPlayRefreshing(false);
          return;
        }
        if (res.status === 404) {
          setPlayByPlay([]);  
          setLastAction(null);
          setNumQs(4);
          setIsPlayRefreshing(false);
          return;
        }
        throw new Error(`S3 fetch failed: ${res.status}`);
      }
      let play = await res.json()

      setGameStatusMessage(null);
      const last = play[play.length - 1] || null;
      setNumQs(last?.period > 4 ? last?.period : 4);
      setLastAction(last);


      if (last?.status?.trim().startsWith('Final')) {
        await getBox(`${PREFIX}/data/boxData/${gameId}.json.gz`);
        ws?.close();
      }
      setPlayByPlay(play);
    } catch (err) {
      console.error('Error in getPlayByPlay:', err);
    } finally {
      setIsPlayLoading(false);
      setIsPlayRefreshing(false);
    }
  }

  const getBox = async (url) => {
    if (!latestBoxRef.current || Object.keys(latestBoxRef.current).length === 0) {
      setIsBoxLoading(true);
    }

    try {
      const res = await fetch(url);
      if (res.status === 403 || res.status === 404) {
        setGameStatusMessage(GAME_NOT_STARTED_MESSAGE);
        setBox({});
        setAwayTeamId(null);
        setHomeTeamId(null);
        return;
      }
      if (!res.ok) throw new Error(`S3 fetch failed: ${res.status}`);
      const box = await res.json();
      setGameStatusMessage(null);
      setBox(box);
      setAwayTeamId(box.awayTeamId ?? box.awayTeam.teamId);
      setHomeTeamId(box.homeTeamId ?? box.homeTeam.teamId);
    } catch (err) {
      console.error('Error in getBox:', err);
    } finally {
      setIsBoxLoading(false);
    }
  }

  const changeDate = (e) => {
    const newDate = e.target.value;
    if (newDate === date) {
      return;
    }
    // setGameStatusMessage(null);
    autoSelectActiveRef.current = false;
    setShouldAutoSelectGame(false);
    setIsScheduleLoading(true);
    setDate(newDate);
    updateQueryParams(newDate, gameId);
  }

  const changeGame = (id) => {
    autoSelectActiveRef.current = false;
    setShouldAutoSelectGame(false);
    if (!id || id === gameId) {
      updateQueryParams(date, id || gameId);
      return;
    }
    setIsBoxLoading(true);
    setIsPlayLoading(true);
    setGameStatusMessage(null);
    setGameId(id);
    updateQueryParams(date, id);
  }

  const processPlayData = (data) => {
    if (data.length === 0) {
      setAwayPlayerTimeline([]);
      setHomePlayerTimeline([]);
      setScoreTimeline([]);
      setAllActions([]);
      setAwayActions([]);
      setHomeActions([]);
      return [];
    }
    setScoreTimeline(processScoreTimeline(data));

    let { awayPlayers, homePlayers } = createPlayers(data, awayTeamId, homeTeamId);
    let awayPlaytimes = createPlaytimes(awayPlayers);
    let homePlaytimes = createPlaytimes(homePlayers);

    let currentQ = 1;
    data.forEach(a => {
      if(a.period !== currentQ) {
        awayPlaytimes = quarterChange(awayPlaytimes);
        homePlaytimes = quarterChange(homePlaytimes);
        currentQ = a.period;
      }
      if(a.teamId === awayTeamId) {
        awayPlaytimes = updatePlaytimesWithAction(a, awayPlaytimes);
      }
      if(a.teamId === homeTeamId) {
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
  }

  const changeStatOn = (index) => {
    const statOnNew = statOn.slice();
    statOnNew[index] = !statOnNew[index];
    setStatOn(statOnNew);
  }
  
  const playByPlaySectionRef = useRef();
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      setPlayByPlaySectionWidth(entries[0].contentRect.width)
    })
    const element = playByPlaySectionRef.current;
    if (!element) {
      return () => {};
    }
    observer.observe(element);
    return () => {
      observer.unobserve(element);
    }
  }, []);


  let awayTeamName = {
    name: box?.awayTeam?.teamName || 'Away Team',
    abr: box?.awayTeam?.teamTricode || '',
  };
  let homeTeamName = {
    name: box?.homeTeam?.teamName || 'Away Team',
    abr: box?.homeTeam?.teamTricode || '',
  };

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
      ></Schedule>
      <Score
        homeTeam={box?.homeTeam?.teamTricode}
        awayTeam={box?.awayTeam?.teamTricode}
        score={scoreTimeline[scoreTimeline.length - 1]}
        date={box.gameEt}
        changeDate={changeDate}
        isLoading={isGameDataLoading}
        statusMessage={gameStatusMessage}></Score>
      <div className='playByPlaySection' ref = {playByPlaySectionRef}>
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
          showScoreDiff={showScoreDiff}></Play>
        <StatButtons
          statOn={statOn}
          changeStatOn={changeStatOn}
          showScoreDiff={showScoreDiff}
          setShowScoreDiff={setShowScoreDiff}
          isLoading={isPlayLoading && showLoading}
          statusMessage={gameStatusMessage}></StatButtons>
      </div>
      <Boxscore box={box} isLoading={isBoxLoading && showLoading} statusMessage={gameStatusMessage}></Boxscore>
    </div>
  );
}
