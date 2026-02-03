import { useEffect, useMemo, useState } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme } from '../hooks/useTheme';
import { getMatchupColors } from '../../helpers/teamColors';
import './Lineups.scss';

const DEFAULT_VISIBLE_COUNT = 5;
const COMPACT_LAST_NAME_MAX = 12;
const COMPACT_LAST_NAME_KEEP = 10;
const DISPLAY_NAME_MAX = 14;
const MAX_SELECTED_PLAYERS = 5;
const SUFFIXES = new Set(['Jr.', 'Sr.', 'II', 'III', 'IV', 'V']);
const LAST_NAME_PARTICLES = new Set([
  'da',
  'de',
  'del',
  'della',
  'di',
  'du',
  'la',
  'le',
  'van',
  'von',
  'ten',
  'ter',
  'st.',
  'saint',
]);
const SORT_LABELS = {
  minutes: 'MIN',
  plusMinus: '+/-',
};

const formatSeconds = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00';
  }
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const formatPlusMinus = (value) => {
  if (!Number.isFinite(value) || value === 0) return '0';
  return value > 0 ? `+${value}` : `${value}`;
};

const buildPlayerOptions = (lineups) => {
  const players = new Set();
  (lineups || []).forEach((lineup) => {
    (lineup?.players || []).forEach((player) => {
      if (player) players.add(player);
    });
  });
  return Array.from(players).sort((a, b) => a.localeCompare(b));
};

const filterLineupsByPlayers = (lineups, selectedPlayers) => {
  const selected = selectedPlayers || [];
  if (!selected.length) return lineups || [];
  return (lineups || []).filter((lineup) => {
    const players = lineup?.players || [];
    if (players.length !== 5) return false;
    return selected.every((player) => players.includes(player));
  });
};

const parseNameParts = (rawName) => {
  const cleaned = String(rawName || '').trim();
  if (!cleaned) {
    return { cleaned: '', first: '', last: '', baseLast: '' };
  }
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) {
    return { cleaned, first: '', last: parts[0], baseLast: parts[0] };
  }
  const first = parts[0];
  const lastToken = parts[parts.length - 1];
  const hasSuffix = SUFFIXES.has(lastToken) && parts.length >= 3;
  const lastIndex = hasSuffix ? parts.length - 2 : parts.length - 1;
  let baseLast = parts[lastIndex];
  let startIndex = lastIndex;
  while (startIndex - 1 > 0) {
    const candidate = parts[startIndex - 1];
    if (!candidate) break;
    if (!LAST_NAME_PARTICLES.has(candidate.toLowerCase())) break;
    startIndex -= 1;
  }
  if (startIndex < lastIndex) {
    baseLast = parts.slice(startIndex, lastIndex + 1).join(' ');
  }
  const last = hasSuffix ? `${baseLast} ${lastToken}` : baseLast;
  return { cleaned, first, last, baseLast };
};

const clampDisplay = (value) => {
  if (value.length <= DISPLAY_NAME_MAX) return value;
  const clipped = value.slice(0, DISPLAY_NAME_MAX - 1).replace(/\.+$/, '');
  return `${clipped}.`;
};

const formatPlayerName = (rawName, lastNameCounts) => {
  const parts = parseNameParts(rawName);
  if (!parts.cleaned) return '';
  if (!parts.baseLast || !parts.last) return parts.cleaned;

  const count = lastNameCounts?.get(parts.baseLast) || 0;
  const needsInitial = count > 1 && parts.first;
  const firstInitial = needsInitial ? `${parts.first.charAt(0)}.` : '';

  let compactLast = parts.last;
  if (parts.last.length > COMPACT_LAST_NAME_MAX) {
    compactLast = `${parts.last.slice(0, COMPACT_LAST_NAME_KEEP)}.`;
  }

  const display = [firstInitial, compactLast].filter(Boolean).join(' ');
  return clampDisplay(display);
};

const buildLastNameCounts = (lineups) => {
  const uniquePlayers = new Set();
  (lineups || []).forEach((lineup) => {
    (lineup?.players || []).forEach((player) => {
      if (player) uniquePlayers.add(player);
    });
  });

  const counts = new Map();
  uniquePlayers.forEach((player) => {
    const parts = parseNameParts(player);
    if (!parts.baseLast) return;
    counts.set(parts.baseLast, (counts.get(parts.baseLast) || 0) + 1);
  });
  return counts;
};

const sortLineups = (lineups, sortConfig) => {
  const sorted = (lineups || []).slice();
  const { key, direction } = sortConfig;
  const directionFactor = direction === 'desc' ? -1 : 1;
  sorted.sort((a, b) => {
    const primaryA = key === 'plusMinus' ? a.plusMinus : a.seconds;
    const primaryB = key === 'plusMinus' ? b.plusMinus : b.seconds;
    if (primaryA !== primaryB) {
      return (primaryA - primaryB) * directionFactor;
    }
    const secondaryA = key === 'plusMinus' ? a.seconds : a.plusMinus;
    const secondaryB = key === 'plusMinus' ? b.seconds : b.plusMinus;
    return (secondaryA - secondaryB) * directionFactor;
  });
  return sorted;
};

export default function Lineups({
  awayTeam,
  homeTeam,
  awayLineups,
  homeLineups,
  isLoading,
  statusMessage,
}) {
  const [sortConfig, setSortConfig] = useState({ key: 'minutes', direction: 'desc' });
  const [showAll, setShowAll] = useState(false);
  const [selectedAwayPlayers, setSelectedAwayPlayers] = useState([]);
  const [selectedHomePlayers, setSelectedHomePlayers] = useState([]);
  const { isDarkMode } = useTheme();
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
    () => filterLineupsByPlayers(awayLineups, selectedAwayPlayers),
    [awayLineups, selectedAwayPlayers],
  );
  const homeFiltered = useMemo(
    () => filterLineupsByPlayers(homeLineups, selectedHomePlayers),
    [homeLineups, selectedHomePlayers],
  );

  const awaySorted = useMemo(
    () => sortLineups(awayFiltered, sortConfig),
    [awayFiltered, sortConfig],
  );
  const homeSorted = useMemo(
    () => sortLineups(homeFiltered, sortConfig),
    [homeFiltered, sortConfig],
  );
  const awayLastNameCounts = useMemo(
    () => buildLastNameCounts(awayFiltered),
    [awayFiltered],
  );
  const homeLastNameCounts = useMemo(
    () => buildLastNameCounts(homeFiltered),
    [homeFiltered],
  );

  const hasData = (awaySorted?.length || 0) > 0 || (homeSorted?.length || 0) > 0;
  const showLoadingIndicator = isLoading && !hasData && !statusMessage;
  const showStatusMessage = Boolean(statusMessage) && !hasData;

  const renderTeamPanel = (
    teamLabel,
    lineups,
    isExpanded,
    onToggle,
    lastNameCounts,
    teamColor,
    selectedPlayers,
    onSelectionChange,
    playerOptions,
  ) => {
    const visible = isExpanded ? lineups : lineups.slice(0, DEFAULT_VISIBLE_COUNT);
    const hasMore = lineups.length > DEFAULT_VISIBLE_COUNT;
    const selectionLimitReached = selectedPlayers.length >= MAX_SELECTED_PLAYERS;
    return (
      <div className="lineupsTeamPanel">
        <div className="lineupsTeamHeader">
          <span
            className="lineupsTeamName"
            style={teamColor ? { color: teamColor } : undefined}
          >
            {teamLabel}
          </span>
          {lineups.length > 0 && (
            <span className="lineupsCount">{lineups.length} lineups</span>
          )}
        </div>
        <div className="lineupsFilters">
          <span className="lineupsFilterLabel">Filter players (max {MAX_SELECTED_PLAYERS})</span>
          <div className="lineupsFilterPills" role="group" aria-label={`${teamLabel} player filters`}>
            {playerOptions.map((player) => {
              const isSelected = selectedPlayers.includes(player);
              const isDisabled = !isSelected && selectionLimitReached;
              return (
                <button
                  key={`${teamLabel}-${player}`}
                  type="button"
                  className={`lineupsFilterPill${isSelected ? ' isSelected' : ''}${isDisabled ? ' isDisabled' : ''}`}
                  onClick={() => {
                    if (isDisabled) return;
                    if (isSelected) {
                      onSelectionChange(selectedPlayers.filter((name) => name !== player));
                      return;
                    }
                    onSelectionChange([...selectedPlayers, player]);
                  }}
                  aria-pressed={isSelected}
                  disabled={isDisabled}
                  title={player}
                >
                  {player}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="lineupsFilterClear"
            onClick={() => onSelectionChange([])}
            disabled={selectedPlayers.length === 0}
          >
            Clear
          </button>
        </div>
        {lineups.length === 0 ? (
          <div className="lineupsEmpty">
            {selectedPlayers.length
              ? 'No 5-man lineups match that selection.'
              : 'No lineup data yet.'}
          </div>
        ) : (
          <>
            <div className="lineupsTable">
              <div className="lineupsRow lineupsRowHeader">
                <span>Lineup</span>
                <button
                  type="button"
                  className={`lineupsSortButton${sortConfig.key === 'minutes' ? ' isActive' : ''}`}
                  onClick={() => setSortConfig((prev) => ({
                    key: 'minutes',
                    direction: prev.key === 'minutes' && prev.direction === 'desc' ? 'asc' : 'desc',
                  }))}
                >
                  {SORT_LABELS.minutes}
                  {sortConfig.key === 'minutes' && (
                    <span className="lineupsSortIndicator">
                      {sortConfig.direction === 'desc' ? '▼' : '▲'}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className={`lineupsSortButton${sortConfig.key === 'plusMinus' ? ' isActive' : ''}`}
                  onClick={() => setSortConfig((prev) => ({
                    key: 'plusMinus',
                    direction: prev.key === 'plusMinus' && prev.direction === 'desc' ? 'asc' : 'desc',
                  }))}
                >
                  {SORT_LABELS.plusMinus}
                  {sortConfig.key === 'plusMinus' && (
                    <span className="lineupsSortIndicator">
                      {sortConfig.direction === 'desc' ? '▼' : '▲'}
                    </span>
                  )}
                </button>
              </div>
              {visible.map((lineup) => (
                <div className="lineupsRow" key={lineup.key}>
                  <div className="lineupsPlayers">
                    {lineup.players.length !== 5 && (
                      <span className="lineupsBadge">{lineup.players.length}-man</span>
                    )}
                    <span className="lineupsNames">
                    {[
                      ...lineup.players.filter((player) => selectedPlayers.includes(player)),
                      ...lineup.players.filter((player) => !selectedPlayers.includes(player)),
                    ].map((player) => {
                      const isSelected = selectedPlayers.includes(player);
                      return (
                        <span
                          className={`lineupsPill${isSelected ? ' isSelected' : ''}`}
                          key={`${lineup.key}-${player}`}
                          title={player}
                          aria-label={player}
                        >
                          {formatPlayerName(player, lastNameCounts)}
                        </span>
                      );
                    })}
                    </span>
                  </div>
                  <span className="lineupsStat">{formatSeconds(lineup.seconds)}</span>
                  <span
                    className={`lineupsStat lineupsPlusMinus${
                      lineup.plusMinus > 0 ? ' isPositive' : lineup.plusMinus < 0 ? ' isNegative' : ''
                    }`}
                  >
                    {formatPlusMinus(lineup.plusMinus)}
                  </span>
                </div>
              ))}
            </div>
            {hasMore && (
              <button
                type="button"
                className="lineupsToggle"
                onClick={onToggle}
              >
                {isExpanded ? 'Show top lineups' : `Show all (${lineups.length})`}
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="lineups">
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
          {renderTeamPanel(
            awayTeam?.name || awayTeam?.abr || 'Away',
          awaySorted,
          showAll,
          () => setShowAll((prev) => !prev),
          awayLastNameCounts,
          matchupColors?.away,
          selectedAwayPlayers,
          setSelectedAwayPlayers,
          awayOptions,
        )}
        {renderTeamPanel(
          homeTeam?.name || homeTeam?.abr || 'Home',
          homeSorted,
          showAll,
          () => setShowAll((prev) => !prev),
          homeLastNameCounts,
          matchupColors?.home,
          selectedHomePlayers,
          setSelectedHomePlayers,
          homeOptions,
        )}
      </div>
    )}
    </div>
  );
}
