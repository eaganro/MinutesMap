import { useCourtVision } from '../hooks';

import Schedule from '../Schedule/Schedule';
import Score from '../Score/Score';
import Boxscore from '../Boxscore/Boxscore';
import Play from '../Play/Play';
import StatButtons from '../StatButtons/StatButtons';
import DarkModeToggle from '../DarkModeToggle/DarkModeToggle';

import './App.scss';

export default function App() {
  const {
    // Schedule
    games, date, gameId, changeDate, changeGame, isScheduleLoading,

    // Score
    homeTeam, awayTeam, currentScore, gameDate, gameStatusMessage, isGameDataLoading,

    // Play-by-play
    awayTeamName,
    homeTeamName,
    awayActions,
    homeActions,
    allActions,
    scoreTimeline,
    awayPlayerTimeline,
    homePlayerTimeline,
    numQs,
    lastAction,
    playByPlaySectionRef,
    playByPlaySectionWidth,
    isPlayLoading,
    showScoreDiff,

    // Stat controls
    statOn, changeStatOn, setShowScoreDiff,

    // Box score
    box, isBoxLoading,
  } = useCourtVision();

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
        games={games}
        date={date}
        changeDate={changeDate}
        changeGame={changeGame}
        isLoading={isScheduleLoading}
        selectedGameId={gameId}
      />
      
      <Score
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        score={currentScore}
        date={gameDate}
        changeDate={changeDate}
        isLoading={isGameDataLoading}
        statusMessage={gameStatusMessage}
      />
      
      <div className='playByPlaySection' ref={playByPlaySectionRef}>
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
          isLoading={isPlayLoading}
          statusMessage={gameStatusMessage}
          showScoreDiff={showScoreDiff}
        />
        <StatButtons
          statOn={statOn}
          changeStatOn={changeStatOn}
          showScoreDiff={showScoreDiff}
          setShowScoreDiff={setShowScoreDiff}
          isLoading={isPlayLoading}
          statusMessage={gameStatusMessage}
        />
      </div>
      
      <Boxscore 
        box={box} 
        isLoading={isBoxLoading} 
        statusMessage={gameStatusMessage} 
      />
    </div>
  );
}
