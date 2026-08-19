import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { resolveFullNameFromRoster } from './PlayExport/playExportModel';
import MobilePlayerSheet from './MobilePlayerSheet';
import CircularProgress from '@mui/material/CircularProgress';
import OddsGraph from './OddsGraph';
import PlayExportControls from './PlayExport/PlayExportControls';
import { usePlayPointerHandlers } from './hooks/usePlayPointerHandlers';
import { usePlayViewModel } from './hooks/usePlayViewModel';
import Player from './Player/Player';
import ScoreGraph from './ScoreGraph';
import PlayTooltip from './PlayTooltip';
import TimelineGrid from './TimelineGrid';
import { MOBILE_TOOLTIP_BREAKPOINT } from './model/layoutModel';
import { usePlayInteraction } from './usePlayInteraction';
import './Play.scss';

const PLAYER_DETAIL_HISTORY_KEY = 'minutesMapPlayerDetail';

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
  showOdds = false,
  statOn,
  changeStatOn,
  emphasizedStatIndex = null,
  onPlayerDetailModeChange,
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
    displayAwayPlayers,
    displayAwayPlayersAll,
    displayAwayPlayerTimeline,
    displayHomePlayers,
    displayHomePlayersAll,
    displayHomePlayerTimeline,
    displayScoreTimeline,
    displayNumQs,
    filteredAllActions,
    filteredScoreTimeline,
    filteredOddsTimeline,
    filteredAwayPlayers,
    filteredHomePlayers,
    filteredAwayPlayerTimeline,
    filteredHomePlayerTimeline,
    filteredLastAction,
    timelineWindow,
    startScoreDiff,
    startOddsProb,
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
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerDetailPeriod, setPlayerDetailPeriod] = useState(0);
  const chartInstructionsId = useId();
  const chartAnnouncementId = useId();

  const clearSelectedPlayer = useCallback(() => {
    setSelectedPlayer(null);
    setPlayerDetailPeriod(0);
  }, []);

  const isCurrentPlayerHistoryEntry = useCallback(
    () => Boolean(window.history.state?.[PLAYER_DETAIL_HISTORY_KEY]),
    [],
  );

  const {
    descriptionArray,
    mouseLinePos,
    highlightActionIds,
    focusActionMeta,
    infoLocked,
    hasPrevAction,
    hasNextAction,
    navigateAction,
    selectBoundaryAction,
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
    oddsTimeline: stablePlayData.oddsTimeline,
    playRef,
  });

  const chartAnnouncement = useMemo(() => {
    if (!descriptionArray.length) return 'No chart event selected.';
    return descriptionArray
      .map((action) => action.description)
      .filter(Boolean)
      .join('. ');
  }, [descriptionArray]);

  const handleChartFocus = useCallback(
    (event) => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      setMousePosition({
        x: rect.left + rect.width / 2,
        y: rect.top + Math.min(rect.height / 2, 280),
      });
      if (!descriptionArray.length) {
        selectBoundaryAction('first');
      }
      setInfoLocked(true);
    },
    [descriptionArray.length, selectBoundaryAction, setInfoLocked, setMousePosition],
  );

  const handleChartBlur = useCallback(
    (event) => {
      if (event.currentTarget.contains(event.relatedTarget)) return;
      setInfoLocked(false);
      resetInteraction(true);
    },
    [resetInteraction, setInfoLocked],
  );

  const handleChartKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape' && event.currentTarget.contains(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        setInfoLocked(false);
        resetInteraction(true);
        event.currentTarget.focus({ preventScroll: true });
        return;
      }
      if (event.target !== event.currentTarget) return;

      let handled = true;
      if (event.key === 'ArrowLeft') {
        if (!navigateAction(-1)) selectBoundaryAction('first');
      } else if (event.key === 'ArrowRight') {
        if (!navigateAction(1)) selectBoundaryAction('last');
      } else if (event.key === 'Home') {
        selectBoundaryAction('first');
      } else if (event.key === 'End') {
        selectBoundaryAction('last');
      } else {
        handled = false;
      }

      if (handled) {
        event.preventDefault();
        event.stopPropagation();
        setInfoLocked(true);
      }
    },
    [navigateAction, resetInteraction, selectBoundaryAction, setInfoLocked],
  );

  useEffect(() => {
    setInfoLocked(false);
    setMouseLinePos(null);
    setDescriptionArray([]);
    setHighlightActionIds([]);
  }, [activePeriod, setInfoLocked, setMouseLinePos, setDescriptionArray, setHighlightActionIds]);

  useEffect(() => {
    clearSelectedPlayer();
  }, [clearSelectedPlayer, gameId]);

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

  const isMobilePlayerSheetEnabled =
    Number.isFinite(sectionWidth) && sectionWidth > 0 && sectionWidth < MOBILE_TOOLTIP_BREAKPOINT;
  const isShowingMobilePlayerDetail = isMobilePlayerSheetEnabled && Boolean(selectedPlayer);
  const controlActivePeriod = isShowingMobilePlayerDetail ? playerDetailPeriod : activePeriod;

  useEffect(() => {
    onPlayerDetailModeChange?.(isShowingMobilePlayerDetail);
  }, [isShowingMobilePlayerDetail, onPlayerDetailModeChange]);

  useEffect(() => () => onPlayerDetailModeChange?.(false), [onPlayerDetailModeChange]);

  useEffect(() => {
    if (!isMobilePlayerSheetEnabled && selectedPlayer) {
      clearSelectedPlayer();
    }
  }, [clearSelectedPlayer, isMobilePlayerSheetEnabled, selectedPlayer]);

  useEffect(() => {
    const handlePopState = (event) => {
      const historyPlayer = event.state?.[PLAYER_DETAIL_HISTORY_KEY] || null;
      if (historyPlayer?.gameId === gameId && isMobilePlayerSheetEnabled) {
        setSelectedPlayer({ teamKey: historyPlayer.teamKey, name: historyPlayer.name });
        setPlayerDetailPeriod(0);
        return;
      }

      if (selectedPlayer) {
        clearSelectedPlayer();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [clearSelectedPlayer, gameId, isMobilePlayerSheetEnabled, selectedPlayer]);

  const selectedPlayerDetail = useMemo(() => {
    if (!selectedPlayer) return null;

    const teamKey = selectedPlayer.teamKey === 'away' ? 'away' : 'home';
    const filteredPlayers = teamKey === 'away' ? displayAwayPlayers : displayHomePlayers;
    const allPlayers = teamKey === 'away' ? displayAwayPlayersAll : displayHomePlayersAll;
    const playerTimelines =
      teamKey === 'away' ? displayAwayPlayerTimeline : displayHomePlayerTimeline;
    const rosterPlayers = box?.teams?.[teamKey]?.players || [];

    if (!Object.prototype.hasOwnProperty.call(filteredPlayers, selectedPlayer.name)) {
      return null;
    }

    return {
      ...selectedPlayer,
      displayName:
        resolveFullNameFromRoster(selectedPlayer.name, rosterPlayers) || selectedPlayer.name,
      actions: filteredPlayers[selectedPlayer.name] || [],
      boxScoreActions: allPlayers[selectedPlayer.name] || [],
      timeline: playerTimelines[selectedPlayer.name] || [],
      teamColor: teamKey === 'away' ? teamColors.away : teamColors.home,
    };
  }, [
    selectedPlayer,
    displayAwayPlayers,
    displayAwayPlayersAll,
    displayAwayPlayerTimeline,
    displayHomePlayers,
    displayHomePlayersAll,
    displayHomePlayerTimeline,
    box,
    teamColors,
  ]);

  const preferredExportContext = useMemo(() => {
    if (!selectedPlayerDetail || !isShowingMobilePlayerDetail) return null;

    const exportRange =
      Number(playerDetailPeriod) > 0
        ? { start: Number(playerDetailPeriod), end: Number(playerDetailPeriod) }
        : {
            start: 1,
            end: isFinal ? numPeriods : latestStartedPeriod || 1,
          };

    return {
      exportView: 'player-stacked',
      exportPlayerKey: `${selectedPlayerDetail.teamKey}:${selectedPlayerDetail.name}`,
      exportRange,
    };
  }, [
    selectedPlayerDetail,
    isShowingMobilePlayerDetail,
    playerDetailPeriod,
    isFinal,
    numPeriods,
    latestStartedPeriod,
  ]);

  useEffect(() => {
    if (selectedPlayer && !selectedPlayerDetail) {
      clearSelectedPlayer();
    }
  }, [clearSelectedPlayer, selectedPlayer, selectedPlayerDetail]);

  const handlePlayerSelect = (teamKey, name) => {
    if (!isMobilePlayerSheetEnabled) return;
    setInfoLocked(false);
    clearHoverIcon();
    resetInteraction(true);
    setSelectedPlayer({ teamKey, name });
    setPlayerDetailPeriod(0);
    window.history.pushState(
      {
        ...(window.history.state || {}),
        [PLAYER_DETAIL_HISTORY_KEY]: { gameId, teamKey, name },
      },
      '',
      window.location.href,
    );
  };

  const handlePlayerDetailClose = () => {
    if (isCurrentPlayerHistoryEntry()) {
      clearSelectedPlayer();
      window.history.back();
      return;
    }
    clearSelectedPlayer();
  };

  const quarterSwitcher = showQuarterSwitcher ? (
    <div className="playQuarterSwitcher" style={{ width: sectionWidth }}>
      {periodOptions.map(({ period, label }) => (
        <button
          key={period}
          type="button"
          className={`quarterTab ${period === controlActivePeriod ? 'isActive' : ''}`}
          onClick={() => {
            if (isShowingMobilePlayerDetail) {
              setPlayerDetailPeriod(period);
              return;
            }
            selectPeriod(period);
          }}
          disabled={isDataLoading || (period !== 0 && period > latestStartedPeriod)}
          aria-pressed={period === controlActivePeriod}
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
          <div className="loadingIndicator" role="status">
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
            <div className="statusMessage" role="status">
              {displayStatusMessage}
            </div>
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
          showOdds,
          statOn,
          teamColors,
          awayColor,
          homeColor,
          preferredExportContext,
        }}
        onExportInteractionStart={() => {
          setInfoLocked(false);
          clearHoverIcon();
          resetInteraction(true);
        }}
      />
      <p id={chartInstructionsId} className="playChartInstructions">
        Interactive play-by-play chart. Use Left and Right Arrow to inspect events, Home and End to
        jump to the first or last event, and Tab to reach available event actions.
      </p>
      <div
        ref={playRef}
        className={`play ${isDataLoading ? 'isLoading' : ''}`}
        style={{ width: sectionWidth }}
        role="region"
        aria-label="Play-by-play chart"
        aria-describedby={`${chartInstructionsId} ${chartAnnouncementId}`}
        aria-busy={isDataLoading}
        tabIndex={isDataLoading ? -1 : 0}
        onFocus={handleChartFocus}
        onBlur={handleChartBlur}
        onKeyDown={handleChartKeyDown}
        onMouseMove={isDataLoading ? undefined : handleMouseMove}
        onMouseLeave={isDataLoading ? undefined : handleMouseLeave}
        onClick={isDataLoading ? undefined : handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        <span
          id={chartAnnouncementId}
          className="playChartAnnouncement"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {chartAnnouncement}
        </span>
        {!isDataLoading && !isShowingMobilePlayerDetail && (
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

        {showLoadingOverlay && !isShowingMobilePlayerDetail && (
          <div className="loadingOverlay" role="status">
            <CircularProgress size={20} thickness={5} />
            <span>Loading play-by-play...</span>
          </div>
        )}

        <div className="playContent">
          {selectedPlayerDetail && isMobilePlayerSheetEnabled ? (
            <MobilePlayerSheet
              selectedPlayer={selectedPlayerDetail}
              playerDisplayName={selectedPlayerDetail.displayName}
              selectedPeriod={playerDetailPeriod}
              numPeriods={numPeriods}
              latestStartedPeriod={latestStartedPeriod}
              isFinal={isFinal}
              actions={selectedPlayerDetail.actions}
              boxScoreActions={selectedPlayerDetail.boxScoreActions}
              timeline={selectedPlayerDetail.timeline}
              scoreTimeline={displayScoreTimeline}
              statOn={statOn}
              onToggleStat={changeStatOn}
              teamColor={selectedPlayerDetail.teamColor}
              onClose={handlePlayerDetailClose}
            />
          ) : (
            <>
              <svg height="600" width={sectionWidth} className="line playGrid" aria-hidden="true">
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

                <OddsGraph
                  oddsTimeline={filteredOddsTimeline}
                  lastAction={filteredLastAction}
                  width={width}
                  leftMargin={leftMargin}
                  timelineWindow={timelineWindow}
                  showOdds={showOdds}
                  startOddsProb={startOddsProb}
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
                    emphasizedStatIndex={emphasizedStatIndex}
                    onSelect={
                      isMobilePlayerSheetEnabled
                        ? () => handlePlayerSelect('away', name)
                        : undefined
                    }
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
                    emphasizedStatIndex={emphasizedStatIndex}
                    onSelect={
                      isMobilePlayerSheetEnabled
                        ? () => handlePlayerSelect('home', name)
                        : undefined
                    }
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
