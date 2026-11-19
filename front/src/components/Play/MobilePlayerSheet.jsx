import { useMemo, useRef, useState } from 'react';
import {
  getPeriodDurationSeconds,
  getPeriodStartSeconds,
  getSecondsElapsed,
} from '../../helpers/playTimeline';
import {
  getEventType,
  isFreeThrowAction,
  isThreePointAction,
} from '../../domain/events/classification';
import { renderEventShape, renderFreeThrowRing } from '../../ui/eventShapes.jsx';
import TeamLogo from '../Schedule/TeamLogo';
import StatButtons from '../StatButtons/StatButtons';
import { buildBoxScoreColumns, computePlayerBoxScore } from './PlayExport/playExportCore';
import { formatPeriodLabel } from './PlayExport/playExportRange';

const EXCLUDED_ACTION_TYPES = new Set(['substitution', 'jump ball', 'jumpball', 'violation']);
const BOX_HIGHLIGHT_KEYS = new Set(['pts', 'reb', 'ast']);
const FREE_THROW_ONE_OF_ONE_PATTERN = /\b(?:ft|free throw)\b\s*1\s*(?:of|\/)\s*1/i;
const REGULATION_PERIOD_SECONDS = getPeriodDurationSeconds(1) || 1;
const COMPACT_LAST_NAME_MAX = 12;
const COMPACT_LAST_NAME_KEEP = 10;

function filterRenderableActions(actions) {
  return (actions || []).filter((action) => {
    const type = String(action?.actionType || '').toLowerCase();
    return !EXCLUDED_ACTION_TYPES.has(type);
  });
}

function filterItemsForRange(items, periodRange) {
  return (items || []).filter((item) => {
    const period = Number(item?.period);
    return period >= periodRange.start && period <= periodRange.end;
  });
}

function buildPeriodRange(selectedPeriod, numPeriods, latestStartedPeriod, isFinal) {
  const totalPeriods = Number(numPeriods);
  const latestPeriod = Number(latestStartedPeriod);
  const safeLatestPeriod = Number.isFinite(latestPeriod) && latestPeriod > 0 ? latestPeriod : 1;
  const visibleEnd =
    isFinal && Number.isFinite(totalPeriods) && totalPeriods > 0 ? totalPeriods : safeLatestPeriod;

  if (Number.isFinite(selectedPeriod) && selectedPeriod > 0) {
    return { start: selectedPeriod, end: selectedPeriod, isFullGame: false };
  }

  return {
    start: 1,
    end: visibleEnd,
    isFullGame: visibleEnd <= 1,
  };
}

// The same key and toggles as under the chart, without Score Lead and Win Odds.
function MobilePlayerLegend({ statOn, onToggleStat }) {
  return (
    <section className="mobilePlayerSheetSection" aria-label="Legend">
      <StatButtons
        statOn={statOn}
        changeStatOn={onToggleStat}
        isLoading={false}
        statusMessage={null}
        showOverlays={false}
      />
    </section>
  );
}

function MobilePlayerBoxScore({ columns }) {
  if (!columns.length) return null;

  const gridStyle = {
    gridTemplateColumns: `minmax(72px, 1.35fr) repeat(${Math.max(
      0,
      columns.length - 1,
    )}, minmax(42px, 1fr))`,
  };

  return (
    <section className="mobilePlayerSheetSection" aria-label="Box score">
      <div className="mobilePlayerBoxScoreScroll">
        <div className="mobilePlayerBoxScore" role="table" aria-label="Player box score">
          <div
            className="mobilePlayerBoxScoreGrid mobilePlayerBoxScoreHeader"
            role="rowgroup"
            style={gridStyle}
          >
            {columns.map((column) => (
              <div
                key={`header-${column.key}`}
                role="columnheader"
                className={`mobilePlayerBoxScoreCell${BOX_HIGHLIGHT_KEYS.has(column.key) ? ' isHighlight' : ''}`}
              >
                {column.label}
              </div>
            ))}
          </div>
          <div
            className="mobilePlayerBoxScoreGrid mobilePlayerBoxScoreRow"
            role="rowgroup"
            style={gridStyle}
          >
            {columns.map((column) => (
              <div
                key={`value-${column.key}`}
                role="cell"
                className={`mobilePlayerBoxScoreCell${BOX_HIGHLIGHT_KEYS.has(column.key) ? ' isHighlight' : ''}${column.key === 'player' ? ' isPlayer' : ''}`}
              >
                {column.value}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function formatPercentage(made, attempted) {
  if (!attempted) return '0.0';
  if (made === attempted) return '100';
  return (Math.round((made / attempted) * 1000) / 10).toFixed(1);
}

function formatCompactPlayerName(playerName) {
  const parts = String(playerName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'Player';
  if (parts.length === 1) return parts[0];

  const firstName = parts[0];
  const familyName = parts.slice(1).join(' ');
  const firstInitial = firstName ? `${firstName.charAt(0)}.` : '';
  let compactLast = familyName;
  if (familyName.length > COMPACT_LAST_NAME_MAX) {
    compactLast = `${familyName.slice(0, COMPACT_LAST_NAME_KEEP)}.`;
  }

  return [firstInitial, compactLast].filter(Boolean).join(' ');
}

function buildMobilePlayerBoxScoreColumns(stats, playerName) {
  const plusMinus = stats.pm === 0 ? '0' : stats.pm > 0 ? `+${stats.pm}` : `${stats.pm}`;
  const compactPlayerName = formatCompactPlayerName(playerName);

  return [
    { key: 'player', label: 'PLAYER', value: compactPlayerName },
    { key: 'min', label: 'MIN', value: buildBoxScoreColumns(stats, playerName, true)[1].value },
    { key: 'pts', label: 'PTS', value: `${stats.pts}` },
    { key: 'reb', label: 'REB', value: `${stats.reb}` },
    { key: 'ast', label: 'AST', value: `${stats.ast}` },
    { key: 'fgm-a', label: 'FGM-A', value: `${stats.fgm}-${stats.fga}` },
    { key: 'fg%', label: 'FG%', value: formatPercentage(stats.fgm, stats.fga) },
    { key: '3pm-a', label: '3PM-A', value: `${stats.tpm}-${stats.tpa}` },
    { key: '3p%', label: '3P%', value: formatPercentage(stats.tpm, stats.tpa) },
    { key: 'ftm-a', label: 'FTM-A', value: `${stats.ftm}-${stats.fta}` },
    { key: 'ft%', label: 'FT%', value: formatPercentage(stats.ftm, stats.fta) },
    { key: 'oreb', label: 'OREB', value: `${stats.oreb}` },
    { key: 'dreb', label: 'DREB', value: `${stats.dreb}` },
    { key: 'stl', label: 'STL', value: `${stats.stl}` },
    { key: 'blk', label: 'BLK', value: `${stats.blk}` },
    { key: 'to', label: 'TO', value: `${stats.to}` },
    { key: 'pf', label: 'PF', value: `${stats.pf}` },
    { key: 'pm', label: '+/-', value: plusMinus },
  ];
}

function MobilePlayerTimelineRows({ periods, actions, timeline }) {
  const renderableActions = useMemo(() => filterRenderableActions(actions), [actions]);

  const pointAtTime = useMemo(() => {
    const values = new Set();
    renderableActions.forEach((action) => {
      if (isFreeThrowAction(action.description, action.actionType)) return;
      if (getEventType(action.description, action.actionType, action.result) === 'point') {
        values.add(`${action.period}|${action.clock}`);
      }
    });
    return values;
  }, [renderableActions]);

  return (
    <div className="mobilePlayerTimelineRows">
      {periods.map((period) => (
        <MobilePlayerTimelineRow
          key={period}
          period={period}
          actions={renderableActions}
          timeline={timeline}
          pointAtTime={pointAtTime}
        />
      ))}
    </div>
  );
}

function MobilePlayerTimelineRow({ period, actions, timeline, pointAtTime }) {
  const rowHeight = 34;
  const chartWidth = 320;
  const horizontalPadding = 10;
  const markerSize = 4.5;
  const rowTop = 16;
  const centerY = rowTop + rowHeight / 2;
  const periodDurationSeconds = getPeriodDurationSeconds(period);
  const usableWidth = chartWidth - horizontalPadding * 2;
  const durationRatio = periodDurationSeconds / REGULATION_PERIOD_SECONDS;
  const rowWidth = Math.max(1, Math.min(usableWidth, usableWidth * durationRatio));
  const rowLeft = horizontalPadding + (usableWidth - rowWidth) / 2;
  const rowRight = rowLeft + rowWidth;
  const periodStartSeconds = getPeriodStartSeconds(period);

  const getXPosition = (clock) => {
    if (periodDurationSeconds <= 0) return rowLeft;
    const elapsed = getSecondsElapsed(period, clock);
    const ratio = (elapsed - periodStartSeconds) / periodDurationSeconds;
    return rowLeft + Math.max(0, Math.min(rowWidth, ratio * rowWidth));
  };

  const shapes = actions
    .filter((action) => Number(action?.period) === period)
    .map((action) => {
      const x = getXPosition(action.clock);
      const timeKey = `${action.period}|${action.clock}`;
      const isFreeThrow = isFreeThrowAction(action.description, action.actionType);

      if (isFreeThrow) {
        return renderFreeThrowRing({
          cx: x,
          cy: centerY,
          size: markerSize,
          key: `ft-${period}-${action.actionNumber ?? `${action.clock}-${action.description}`}`,
          description: action.description,
          subType: action.subType,
          isAnd1: FREE_THROW_ONE_OF_ONE_PATTERN.test(
            `${action.subType || ''} ${action.description || ''}`,
          )
            ? pointAtTime.has(timeKey)
            : false,
        });
      }

      return renderEventShape(
        getEventType(action.description, action.actionType, action.result),
        x,
        centerY,
        markerSize,
        `event-${period}-${action.actionNumber ?? `${action.clock}-${action.description}`}`,
        isThreePointAction(action.description, action.actionType),
      );
    })
    .filter(Boolean);

  const segments = (timeline || [])
    .filter((entry) => Number(entry?.period) === period && entry?.end)
    .map((entry, index) => {
      const x1 = getXPosition(entry.start);
      const x2 = getXPosition(entry.end);
      return (
        <line
          key={`segment-${period}-${index}`}
          x1={x1}
          y1={centerY}
          x2={x2}
          y2={centerY}
          className="mobilePlayerTimelineSegment"
        />
      );
    });

  return (
    <div className="mobilePlayerTimelineRow">
      <div className="mobilePlayerTimelineLabel">{formatPeriodLabel(period)}</div>
      <svg
        className="mobilePlayerTimelineSvg"
        viewBox={`0 0 ${chartWidth} 56`}
        role="img"
        aria-label={`${formatPeriodLabel(period)} timeline`}
      >
        <line
          x1={rowLeft}
          y1={centerY - 6}
          x2={rowLeft}
          y2={centerY + 6}
          className="mobilePlayerTimelineCap"
        />
        <line
          x1={rowRight}
          y1={centerY - 6}
          x2={rowRight}
          y2={centerY + 6}
          className="mobilePlayerTimelineCap"
        />
        {segments}
        {shapes}
      </svg>
    </div>
  );
}

export default function MobilePlayerSheet({
  selectedPlayer,
  playerDisplayName,
  selectedPeriod,
  numPeriods,
  latestStartedPeriod,
  isFinal,
  actions,
  boxScoreActions,
  timeline,
  scoreTimeline,
  statOn,
  onToggleStat,
  teamColor,
  team,
  teamName,
  showBackHint = false,
  onClose,
}) {
  const ignoreNextCloseClickRef = useRef(false);
  const [hasBackHintEnded, setHasBackHintEnded] = useState(false);
  const isBackHintActive = showBackHint && !hasBackHintEnded;
  const periodRange = useMemo(
    () => buildPeriodRange(selectedPeriod, numPeriods, latestStartedPeriod, isFinal),
    [selectedPeriod, numPeriods, latestStartedPeriod, isFinal],
  );
  const periods = useMemo(
    () =>
      Array.from(
        { length: Math.max(1, periodRange.end - periodRange.start + 1) },
        (_, index) => periodRange.start + index,
      ),
    [periodRange],
  );
  const rangeActions = useMemo(
    () => filterItemsForRange(actions, periodRange),
    [actions, periodRange],
  );
  const rangeBoxScoreActions = useMemo(
    () => filterItemsForRange(boxScoreActions, periodRange),
    [boxScoreActions, periodRange],
  );
  const rangeTimeline = useMemo(
    () => filterItemsForRange(timeline, periodRange),
    [timeline, periodRange],
  );
  const boxScoreStats = useMemo(
    () =>
      computePlayerBoxScore({
        actions: rangeBoxScoreActions,
        timeline: rangeTimeline,
        scoreTimeline,
        displayScoreTimeline: scoreTimeline,
        periodRange,
        teamKey: selectedPlayer?.teamKey || null,
      }),
    [rangeBoxScoreActions, rangeTimeline, scoreTimeline, periodRange, selectedPlayer],
  );
  const boxScoreColumns = useMemo(
    () => buildMobilePlayerBoxScoreColumns(boxScoreStats, playerDisplayName),
    [boxScoreStats, playerDisplayName],
  );
  const consumeCloseStart = (event) => {
    event.stopPropagation();
  };
  const handleCloseTouchEnd = (event) => {
    event.preventDefault();
    event.stopPropagation();
    ignoreNextCloseClickRef.current = true;
    onClose?.();
  };
  const handleCloseClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (ignoreNextCloseClickRef.current) {
      ignoreNextCloseClickRef.current = false;
      return;
    }
    onClose?.();
  };

  return (
    <section
      className="mobilePlayerSheet"
      aria-label={`${playerDisplayName} detail view`}
      data-testid="mobile-player-sheet"
    >
      <div className="mobilePlayerSheetHeader">
        {team && (
          <span className="mobilePlayerSheetTeam" role="img" aria-label={teamName || team}>
            <TeamLogo team={team} size={26} />
          </span>
        )}
        <h2 className="mobilePlayerSheetTitle" style={teamColor ? { color: teamColor } : undefined}>
          {playerDisplayName}
        </h2>
        <button
          type="button"
          className={`mobilePlayerSheetClose${isBackHintActive ? ' isFirstVisitHint' : ''}`}
          onAnimationEnd={() => setHasBackHintEnded(true)}
          onClick={handleCloseClick}
          onTouchStart={consumeCloseStart}
          onTouchMove={consumeCloseStart}
          onTouchEnd={handleCloseTouchEnd}
          aria-label={`Close ${playerDisplayName} detail view`}
        >
          Back
        </button>
      </div>

      <div className="mobilePlayerSheetCard">
        <MobilePlayerTimelineRows
          periods={periods}
          actions={rangeActions}
          timeline={rangeTimeline}
        />
        <MobilePlayerLegend statOn={statOn} onToggleStat={onToggleStat} />
        <MobilePlayerBoxScore columns={boxScoreColumns} />
      </div>
    </section>
  );
}
