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
    gameStatus,

    // Stat controls
    statOn, changeStatOn, setShowScoreDiff,

    // Box score
    box, isBoxLoading,
  } = useCourtVision();

  return (
    <div className='topLevel'>
      <header className='appHeader'>
        <div className='appBranding'>
          <picture>
            <source
              type="image/avif"
              srcSet="/logo-70.avif 1x, /logo-140.avif 2x"
            />
            <source
              type="image/webp"
              srcSet="/logo-70.webp 1x, /logo-140.webp 2x"
            />
            <img
              src="/logo-70.png"
              srcSet="/logo-70.png 1x, /logo-140.png 2x"
              width="70"
              height="70"
              alt="CourtVision logo"
              className='appLogo'
            />
          </picture>
          <span className='appName'>CourtVision</span>
        </div>
        <DarkModeToggle />
      </header>
      <main className='appMain'>
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
          lastAction={lastAction}
          gameStatus={gameStatus}
        />
        
        <div className='playByPlaySection' ref={playByPlaySectionRef}>
          <Play
            gameId={gameId}
            gameStatus={gameStatus}
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
      </main>
    </div>
  );
}
