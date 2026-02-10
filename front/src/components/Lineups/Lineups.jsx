import { useEffect, useMemo, useState } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme } from '../hooks/useTheme';
import { getMatchupColors } from '../../helpers/teamColors';
import { useTrackFeatureUseOnce } from '../hooks/useTrackFeatureUseOnce';
import LineupsTeamPanel from './LineupsTeamPanel';
import {
  buildLastNameCounts,
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

  const hasData = (awaySorted?.length || 0) > 0 || (homeSorted?.length || 0) > 0;
  const showLoadingIndicator = isLoading && !hasData && !statusMessage;
  const showStatusMessage = Boolean(statusMessage) && !hasData;

  return (
    <div className="lineups" onClick={trackLineupsFeatureUse} onTouchStart={trackLineupsFeatureUse}>
      <div className="lineupsHeader">
        <div className="lineupsTitle">
          <span>Lineups</span>
        </div>
      </div>

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
            sortConfig={sortConfig}
            onSortChange={setSortConfig}
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
            sortConfig={sortConfig}
            onSortChange={setSortConfig}
          />
        </div>
      )}
    </div>
  );
}
