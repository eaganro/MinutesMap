import { useEffect, useMemo, useRef, useState } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme } from '../hooks/ui/useTheme';
import { getMatchupColors } from '../../helpers/teamColors';
import { useTrackFeatureUseOnce } from '../hooks/analytics/useTrackFeatureUseOnce';
import LineupsTeamPanel from './LineupsTeamPanel';
import {
  buildLastNameCounts,
  buildPlayerDisplayNames,
  buildPlayerOptions,
  filterLineupsByPlayers,
  sortLineups,
} from './lineupsUtils';
import './Lineups.scss';

const INITIAL_SORT_CONFIG = { key: 'minutes', direction: 'desc' };

export default function Lineups({
  awayTeam,
  homeTeam,
  awayLineups,
  homeLineups,
  isLoading,
  statusMessage,
}) {
  const [sortConfig, setSortConfig] = useState(INITIAL_SORT_CONFIG);
  const [showAll, setShowAll] = useState(false);
  const [selectedAwayPlayers, setSelectedAwayPlayers] = useState([]);
  const [selectedHomePlayers, setSelectedHomePlayers] = useState([]);
  const [awaySelectionMode, setAwaySelectionMode] = useState('filter');
  const [homeSelectionMode, setHomeSelectionMode] = useState('filter');
  const [topSectionMinHeight, setTopSectionMinHeight] = useState(0);
  const awayTopRef = useRef(null);
  const homeTopRef = useRef(null);
  const { isDarkMode } = useTheme();
  const trackLineupsFeatureUse = useTrackFeatureUseOnce('lineups');
  const matchupColors = getMatchupColors(awayTeam?.abr, homeTeam?.abr, isDarkMode);

  const awayOptions = useMemo(() => buildPlayerOptions(awayLineups), [awayLineups]);
  const homeOptions = useMemo(() => buildPlayerOptions(homeLineups), [homeLineups]);

  useEffect(() => {
    setSelectedAwayPlayers((prev) => prev.filter((player) => awayOptions.includes(player)));
  }, [awayOptions]);

  useEffect(() => {
    setSelectedHomePlayers((prev) => prev.filter((player) => homeOptions.includes(player)));
  }, [homeOptions]);

  const awayFiltered = useMemo(
    () => filterLineupsByPlayers(awayLineups, selectedAwayPlayers, awaySelectionMode),
    [awayLineups, selectedAwayPlayers, awaySelectionMode],
  );
  const homeFiltered = useMemo(
    () => filterLineupsByPlayers(homeLineups, selectedHomePlayers, homeSelectionMode),
    [homeLineups, selectedHomePlayers, homeSelectionMode],
  );

  const awaySorted = useMemo(
    () => sortLineups(awayFiltered, sortConfig),
    [awayFiltered, sortConfig],
  );
  const homeSorted = useMemo(
    () => sortLineups(homeFiltered, sortConfig),
    [homeFiltered, sortConfig],
  );
  const awayLastNameCounts = useMemo(() => buildLastNameCounts(awayFiltered), [awayFiltered]);
  const homeLastNameCounts = useMemo(() => buildLastNameCounts(homeFiltered), [homeFiltered]);
  const awayPlayerDisplayNames = useMemo(() => buildPlayerDisplayNames(awayLineups), [awayLineups]);
  const homePlayerDisplayNames = useMemo(() => buildPlayerDisplayNames(homeLineups), [homeLineups]);

  const hasData = (awaySorted?.length || 0) > 0 || (homeSorted?.length || 0) > 0;
  const showLoadingIndicator = isLoading && !hasData && !statusMessage;
  const showStatusMessage = Boolean(statusMessage) && !hasData;

  useEffect(() => {
    const awayTop = awayTopRef.current;
    const homeTop = homeTopRef.current;
    if (!awayTop || !homeTop) return undefined;

    const isDesktop = () => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
      return window.matchMedia('(min-width: 921px)').matches;
    };

    const syncTopHeights = () => {
      if (!isDesktop()) {
        setTopSectionMinHeight((prev) => (prev === 0 ? prev : 0));
        return;
      }

      const prevAwayMinHeight = awayTop.style.minHeight;
      const prevHomeMinHeight = homeTop.style.minHeight;
      awayTop.style.minHeight = '0px';
      homeTop.style.minHeight = '0px';

      const nextHeight = Math.max(
        Math.ceil(awayTop.getBoundingClientRect().height),
        Math.ceil(homeTop.getBoundingClientRect().height),
      );

      awayTop.style.minHeight = prevAwayMinHeight;
      homeTop.style.minHeight = prevHomeMinHeight;

      setTopSectionMinHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };

    syncTopHeights();

    let resizeObserver;
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(syncTopHeights);
      resizeObserver.observe(awayTop);
      resizeObserver.observe(homeTop);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', syncTopHeights);
    }

    return () => {
      resizeObserver?.disconnect();
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', syncTopHeights);
      }
    };
  }, [showLoadingIndicator, showStatusMessage]);

  return (
    <div className="lineups" onClick={trackLineupsFeatureUse} onTouchStart={trackLineupsFeatureUse}>
      {showLoadingIndicator ? (
        <div className="lineupsLoading">
          <CircularProgress size={22} thickness={5} />
          <span>Loading lineups...</span>
        </div>
      ) : showStatusMessage ? (
        <div className="lineupsStatus">{statusMessage}</div>
      ) : (
        <div className="lineupsGrid">
          <LineupsTeamPanel
            teamLabel={awayTeam?.name || awayTeam?.abr || 'Away'}
            lineups={awaySorted}
            isExpanded={showAll}
            onToggle={() => setShowAll((prev) => !prev)}
            lastNameCounts={awayLastNameCounts}
            teamColor={matchupColors?.away}
            selectedPlayers={selectedAwayPlayers}
            onSelectionChange={setSelectedAwayPlayers}
            selectionMode={awaySelectionMode}
            onSelectionModeChange={setAwaySelectionMode}
            playerOptions={awayOptions}
            playerDisplayNames={awayPlayerDisplayNames}
            sortConfig={sortConfig}
            onSortChange={setSortConfig}
            topSectionRef={awayTopRef}
            topSectionMinHeight={topSectionMinHeight}
          />
          <LineupsTeamPanel
            teamLabel={homeTeam?.name || homeTeam?.abr || 'Home'}
            lineups={homeSorted}
            isExpanded={showAll}
            onToggle={() => setShowAll((prev) => !prev)}
            lastNameCounts={homeLastNameCounts}
            teamColor={matchupColors?.home}
            selectedPlayers={selectedHomePlayers}
            onSelectionChange={setSelectedHomePlayers}
            selectionMode={homeSelectionMode}
            onSelectionModeChange={setHomeSelectionMode}
            playerOptions={homeOptions}
            playerDisplayNames={homePlayerDisplayNames}
            sortConfig={sortConfig}
            onSortChange={setSortConfig}
            topSectionRef={homeTopRef}
            topSectionMinHeight={topSectionMinHeight}
          />
        </div>
      )}
    </div>
  );
}
