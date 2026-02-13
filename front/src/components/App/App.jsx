import { useMinutesMap } from '../hooks';

import Schedule from '../Schedule/Schedule';
import Score from '../Score/Score';
import Boxscore from '../Boxscore/Boxscore';
import Lineups from '../Lineups/Lineups';
import Play from '../Play/Play';
import StatButtons from '../StatButtons/StatButtons';
import DarkModeToggle from '../DarkModeToggle/DarkModeToggle';
import Footer from '../Footer/Footer';

import './App.scss';

export default function App() {
  const { scheduleVm, scoreVm, playVm, statControlsVm, boxVm, lineupsVm } = useMinutesMap();

  return (
    <div className="topLevel">
      <header className="appHeader">
        <a className="appBranding" href="/" aria-label="MinutesMap home">
          <picture>
            <source type="image/avif" srcSet="/logo-70.avif 1x, /logo-140.avif 2x" />
            <source type="image/webp" srcSet="/logo-70.webp 1x, /logo-140.webp 2x" />
            <img
              src="/logo-70.png"
              srcSet="/logo-70.png 1x, /logo-140.png 2x"
              width="70"
              height="70"
              alt="MinutesMap logo"
              className="appLogo"
            />
          </picture>
          <span className="appName">MinutesMap</span>
        </a>
        <div className="appHeaderActions">
          {/*
          <a
            className="appSocialLink"
            href="https://x.com/intent/follow?screen_name=MinutesMap"
            target="_blank"
            rel="noreferrer"
            aria-label="Follow @MinutesMap on X"
            title="Follow @MinutesMap on X"
          >
            Follow on X
          </a>
          */}
          <DarkModeToggle />
        </div>
      </header>
      <main className="appMain">
        <Schedule
          games={scheduleVm.games}
          date={scheduleVm.date}
          changeDate={scheduleVm.changeDate}
          changeGame={scheduleVm.changeGame}
          isLoading={scheduleVm.isLoading}
          selectedGameId={scheduleVm.gameId}
        />

        <Score
          homeTeam={scoreVm.homeTeam}
          awayTeam={scoreVm.awayTeam}
          score={scoreVm.currentScore}
          date={scoreVm.gameDate}
          changeDate={scheduleVm.changeDate}
          isLoading={scoreVm.isLoading}
          statusMessage={scoreVm.gameStatusMessage}
          lastAction={scoreVm.lastAction}
          gameStatus={scoreVm.gameStatus}
        />

        <div className="playByPlaySection" ref={playVm.playByPlaySectionRef}>
          <Play
            gameId={playVm.gameId}
            nbaGameId={playVm.nbaGameId}
            gameStatus={playVm.gameStatus}
            box={playVm.box}
            playData={playVm.playData}
            sectionWidth={playVm.playByPlaySectionWidth}
            isLoading={playVm.isLoading}
            statusMessage={playVm.statusMessage}
            showScoreDiff={playVm.showScoreDiff}
            statOn={playVm.statOn}
          />
          <StatButtons
            statOn={statControlsVm.statOn}
            changeStatOn={statControlsVm.changeStatOn}
            showScoreDiff={statControlsVm.showScoreDiff}
            setShowScoreDiff={statControlsVm.setShowScoreDiff}
            isLoading={statControlsVm.isLoading}
            statusMessage={statControlsVm.statusMessage}
          />
        </div>

        <Boxscore box={boxVm.box} isLoading={boxVm.isLoading} statusMessage={boxVm.statusMessage} />
        <Lineups
          awayTeam={lineupsVm.awayTeam}
          homeTeam={lineupsVm.homeTeam}
          awayLineups={lineupsVm.awayLineups}
          homeLineups={lineupsVm.homeLineups}
          isLoading={lineupsVm.isLoading}
          statusMessage={lineupsVm.statusMessage}
        />
      </main>
      <Footer />
    </div>
  );
}
