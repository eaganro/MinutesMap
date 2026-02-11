import { useEffect } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import PlayExportControls from './PlayExport/PlayExportControls';
import { usePlayPointerHandlers } from './hooks/usePlayPointerHandlers';
import { usePlayViewModel } from './hooks/usePlayViewModel';
import Player from './Player/Player';
import ScoreGraph from './ScoreGraph';
import PlayTooltip from './PlayTooltip';
import TimelineGrid from './TimelineGrid';
import { usePlayInteraction } from './usePlayInteraction';
import './Play.scss';

export default function Play({
  gameId,
  nbaGameId,
  gameStatus,
  box,
  playData,
  sectionWidth,
  isLoading,
  statusMessage,
  showScoreDiff = true,
  statOn,
}) {
  const {
    playRef,
    leftMargin,
    rightMargin,
    width,
    qWidth,
    numPeriods,
    isFinal,
    activePeriod,
    isQuarterFocus,
    activePeriodLabel,
    latestStartedPeriod,
    selectPeriod,
    showQuarterSwitcher,
    periodOptions,
    showLoadingIndicator,
    showLoadingOverlay,
    displayStatusMessage,
    showStatusMessage,
    isDataLoading,
    hasDisplayData,
    displayAwayTeamNames,
    displayHomeTeamNames,
    displayNumQs,
    filteredAllActions,
    filteredScoreTimeline,
    filteredAwayPlayers,
    filteredHomePlayers,
    filteredAwayPlayerTimeline,
    filteredHomePlayerTimeline,
    filteredLastAction,
    timelineWindow,
    startScoreDiff,
    teamColors,
    awayColor,
    homeColor,
    maxLead,
    maxY,
    stablePlayData,
    periodData,
  } = usePlayViewModel({
    gameId,
    gameStatus,
    playData,
    sectionWidth,
    isLoading,
    statusMessage,
  });

  const {
    descriptionArray,
    mouseLinePos,
    highlightActionIds,
    focusActionMeta,
    infoLocked,
    hasPrevAction,
    hasNextAction,
    navigateAction,
    setInfoLocked,
    mousePosition,
    setMousePosition,
    setMouseLinePos,
    setDescriptionArray,
    setHighlightActionIds,
    updateHoverAt,
    resetInteraction,
  } = usePlayInteraction({
    leftMargin,
    timelineWidth: width,
    timelineWindow,
    allActions: filteredAllActions,
    playRef,
  });

  useEffect(() => {
    setInfoLocked(false);
    setMouseLinePos(null);
    setDescriptionArray([]);
    setHighlightActionIds([]);
  }, [activePeriod, setInfoLocked, setMouseLinePos, setDescriptionArray, setHighlightActionIds]);

  const {
    isHoveringIcon,
    clearHoverIcon,
    handleMouseMove,
    handleMouseLeave,
    handleClick,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
  } = usePlayPointerHandlers({
    playRef,
    nbaGameId,
    displayAllActions: filteredAllActions,
    isDataLoading,
    infoLocked,
    descriptionArray,
    setInfoLocked,
    setMousePosition,
    updateHoverAt,
    resetInteraction,
  });

  const quarterSwitcher = showQuarterSwitcher ? (
    <div className="playQuarterSwitcher" style={{ width: sectionWidth }}>
      {periodOptions.map(({ period, label }) => (
        <button
          key={period}
          type="button"
          className={`quarterTab ${period === activePeriod ? 'isActive' : ''}`}
          onClick={() => selectPeriod(period)}
          disabled={isDataLoading || (period !== 0 && period > latestStartedPeriod)}
          aria-pressed={period === activePeriod}
        >
          {label}
        </button>
      ))}
    </div>
  ) : null;

  if (showLoadingIndicator) {
    return (
      <div className="playWrapper">
        {quarterSwitcher}
        <div className="play">
          <div className="loadingIndicator">
            <CircularProgress size={24} thickness={5} />
            <span>Loading play-by-play...</span>
          </div>
        </div>
      </div>
    );
  }

  if (showStatusMessage) {
    return (
      <div className="playWrapper">
        {quarterSwitcher}
        <div className={`play ${isDataLoading ? 'isLoading' : ''}`}>
          <div className="playContent">
            <div className="statusMessage">{displayStatusMessage}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="playWrapper">
      {quarterSwitcher}
      <PlayExportControls
        playRef={playRef}
        gameId={gameId}
        gameStatus={gameStatus}
        box={box}
        exportData={{
          stablePlayData,
          periodData,
          hasDisplayData,
          isDataLoading,
          isFinal,
          numPeriods,
          leftMargin,
          rightMargin,
          showScoreDiff,
          statOn,
          teamColors,
          awayColor,
          homeColor,
        }}
        onExportInteractionStart={() => {
          setInfoLocked(false);
          clearHoverIcon();
          resetInteraction(true);
        }}
      />
      <div
        ref={playRef}
        className={`play ${isDataLoading ? 'isLoading' : ''}`}
        style={{ width: sectionWidth }}
        onMouseMove={isDataLoading ? undefined : handleMouseMove}
        onMouseLeave={isDataLoading ? undefined : handleMouseLeave}
        onClick={isDataLoading ? undefined : handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {!isDataLoading && (
          <PlayTooltip
            descriptionArray={descriptionArray}
            focusActionMeta={focusActionMeta}
            mousePosition={mousePosition}
            infoLocked={infoLocked}
            isHoveringIcon={isHoveringIcon}
            nbaGameId={nbaGameId}
            allActions={filteredAllActions}
            hasPrevAction={hasPrevAction}
            hasNextAction={hasNextAction}
            onNavigate={navigateAction}
            containerRef={playRef}
            awayTeamNames={displayAwayTeamNames}
            homeTeamNames={displayHomeTeamNames}
            teamColors={teamColors}
            leftMargin={leftMargin}
          />
        )}

        {showLoadingOverlay && (
          <div className="loadingOverlay">
            <CircularProgress size={20} thickness={5} />
            <span>Loading play-by-play...</span>
          </div>
        )}

        <div className="playContent">
          <svg height="600" width={sectionWidth} className="line playGrid">
            <TimelineGrid
              width={width}
              leftMargin={leftMargin}
              qWidth={qWidth}
              numQs={displayNumQs}
              maxLead={maxLead}
              maxY={maxY}
              showScoreDiff={showScoreDiff}
              awayTeamName={displayAwayTeamNames.name}
              homeTeamName={displayHomeTeamNames.name}
              teamColors={teamColors}
              isQuarterView={isQuarterFocus}
              activePeriodLabel={activePeriodLabel}
            />

            <ScoreGraph
              scoreTimeline={filteredScoreTimeline}
              lastAction={filteredLastAction}
              width={width}
              leftMargin={leftMargin}
              timelineWindow={timelineWindow}
              maxY={maxY}
              showScoreDiff={showScoreDiff}
              awayColor={awayColor}
              homeColor={homeColor}
              startScoreDiff={startScoreDiff}
            />

            {mouseLinePos !== null && (
              <line
                x1={mouseLinePos}
                y1={10}
                x2={mouseLinePos}
                y2={590}
                style={{ stroke: 'var(--mouse-line-color)', strokeWidth: 1 }}
              />
            )}
          </svg>

          <div className="teamName" style={{ color: teamColors.away }}>
            {displayAwayTeamNames.name}
          </div>
          <div className="teamSection">
            {Object.keys(filteredAwayPlayers).map((name) => (
              <Player
                key={name}
                actions={filteredAwayPlayers[name]}
                timeline={filteredAwayPlayerTimeline[name]}
                name={name}
                width={width}
                rightMargin={rightMargin}
                heightDivide={Object.keys(filteredAwayPlayers).length}
                highlight={highlightActionIds}
                leftMargin={leftMargin}
                timelineWindow={timelineWindow}
              />
            ))}
          </div>

          <div className="teamName" style={{ color: teamColors.home }}>
            {displayHomeTeamNames.name}
          </div>
          <div className="teamSection">
            {Object.keys(filteredHomePlayers).map((name) => (
              <Player
                key={name}
                actions={filteredHomePlayers[name]}
                timeline={filteredHomePlayerTimeline[name]}
                name={name}
                width={width}
                rightMargin={rightMargin}
                heightDivide={Object.keys(filteredHomePlayers).length}
                highlight={highlightActionIds}
                leftMargin={leftMargin}
                timelineWindow={timelineWindow}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
