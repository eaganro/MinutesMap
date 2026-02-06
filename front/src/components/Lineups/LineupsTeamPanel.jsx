import {
  DEFAULT_VISIBLE_COUNT,
  MAX_SELECTED_PLAYERS,
  SORT_LABELS,
  formatPlayerName,
  formatPlusMinus,
  formatSeconds,
  getNextSortConfig,
} from './lineupsUtils';

export default function LineupsTeamPanel({
  teamLabel,
  lineups,
  isExpanded,
  onToggle,
  lastNameCounts,
  teamColor,
  selectedPlayers,
  onSelectionChange,
  selectionMode,
  onSelectionModeChange,
  playerOptions,
  sortConfig,
  onSortChange,
}) {
  const visible = isExpanded ? lineups : lineups.slice(0, DEFAULT_VISIBLE_COUNT);
  const hasMore = lineups.length > DEFAULT_VISIBLE_COUNT;
  const selectionLimitReached = selectedPlayers.length >= MAX_SELECTED_PLAYERS;
  const selectedPlayersSet = new Set(selectedPlayers);
  const summary =
    selectedPlayers.length && selectionMode === 'filter'
      ? lineups.reduce(
          (acc, lineup) => ({
            seconds: acc.seconds + (lineup?.seconds || 0),
            plusMinus: acc.plusMinus + (lineup?.plusMinus || 0),
          }),
          { seconds: 0, plusMinus: 0 },
        )
      : null;

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
        <div className="lineupsFilterMode" role="group" aria-label={`${teamLabel} selection mode`}>
          <button
            type="button"
            className={`lineupsFilterModeButton${selectionMode === 'filter' ? ' isActive' : ''}`}
            onClick={() => onSelectionModeChange('filter')}
          >
            Filter
          </button>
          <button
            type="button"
            className={`lineupsFilterModeButton${selectionMode === 'highlight' ? ' isActive' : ''}`}
            onClick={() => onSelectionModeChange('highlight')}
          >
            Highlight
          </button>
        </div>
        <div className="lineupsFilterPills" role="group" aria-label={`${teamLabel} player filters`}>
          {playerOptions.map((player) => {
            const isSelected = selectedPlayersSet.has(player);
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
          {selectedPlayers.length && selectionMode === 'filter'
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
                onClick={() =>
                  onSortChange((prev) => getNextSortConfig(prev, 'minutes'))
                }
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
                onClick={() =>
                  onSortChange((prev) => getNextSortConfig(prev, 'plusMinus'))
                }
              >
                {SORT_LABELS.plusMinus}
                {sortConfig.key === 'plusMinus' && (
                  <span className="lineupsSortIndicator">
                    {sortConfig.direction === 'desc' ? '▼' : '▲'}
                  </span>
                )}
              </button>
            </div>
            {summary && (
              <div className="lineupsRow lineupsRowSummary">
                <div className="lineupsPlayers">
                  <span className="lineupsSummaryLabel">Selected total</span>
                  <span className="lineupsNames">
                    {selectedPlayers.map((player) => (
                      <span
                        className="lineupsPill isSelected"
                        key={`${teamLabel}-summary-${player}`}
                        title={player}
                        aria-label={player}
                      >
                        {formatPlayerName(player, lastNameCounts)}
                      </span>
                    ))}
                  </span>
                </div>
                <span className="lineupsStat">{formatSeconds(summary.seconds)}</span>
                <span
                  className={`lineupsStat lineupsPlusMinus${
                    summary.plusMinus > 0 ? ' isPositive' : summary.plusMinus < 0 ? ' isNegative' : ''
                  }`}
                >
                  {formatPlusMinus(summary.plusMinus)}
                </span>
              </div>
            )}
            {visible.map((lineup) => (
              <div className="lineupsRow" key={lineup.key}>
                <div className="lineupsPlayers">
                  {lineup.players.length !== 5 && (
                    <span className="lineupsBadge">{lineup.players.length}-man</span>
                  )}
                  <span className="lineupsNames">
                    {[
                      ...lineup.players.filter((player) => selectedPlayersSet.has(player)),
                      ...lineup.players.filter((player) => !selectedPlayersSet.has(player)),
                    ].map((player) => {
                      const isSelected = selectedPlayersSet.has(player);
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
}
