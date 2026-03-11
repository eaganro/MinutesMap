import { useMemo } from 'react';
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
import { LegendShape, renderEventShape, renderFreeThrowRing } from '../../ui/eventShapes.jsx';
import { buildBoxScoreColumns, computePlayerBoxScore } from './PlayExport/playExportCore';
import { formatPeriodLabel } from './PlayExport/playExportRange';

const EXCLUDED_ACTION_TYPES = new Set(['substitution', 'jump ball', 'jumpball', 'violation']);
const BOX_HIGHLIGHT_KEYS = new Set(['pts', 'reb', 'ast']);
const FREE_THROW_ONE_OF_ONE_PATTERN = /\b(?:ft|free throw)\b\s*1\s*(?:of|\/)\s*1/i;
const REGULATION_PERIOD_SECONDS = getPeriodDurationSeconds(1) || 1;

const LEGEND_GROUPS = [
  {
    key: 'point',
    toggleIndex: 0,
    items: [
      { key: '2pt-made', label: '2PT', eventType: 'point' },
      { key: '3pt-made', label: '3PT', eventType: 'point', is3PT: true },
      { key: 'ft-made', label: 'FT', type: 'freeThrowMade' },
    ],
  },
  {
    key: 'miss',
    toggleIndex: 1,
    items: [
      { key: '2pt-miss', label: 'MISS', eventType: 'miss' },
      { key: '3pt-miss', label: '3PT', eventType: 'miss', is3PT: true },
      { key: 'ft-miss', label: 'FT', type: 'freeThrowMiss' },
    ],
  },
  { key: 'reb', toggleIndex: 2, items: [{ key: 'reb', label: 'REB', eventType: 'rebound' }] },
  { key: 'ast', toggleIndex: 3, items: [{ key: 'ast', label: 'AST', eventType: 'assist' }] },
  {
    key: 'to',
    toggleIndex: 4,
    items: [{ key: 'to', label: 'TO', eventType: 'turnover' }],
  },
  { key: 'blk', toggleIndex: 5, items: [{ key: 'blk', label: 'BLK', eventType: 'block' }] },
  { key: 'stl', toggleIndex: 6, items: [{ key: 'stl', label: 'STL', eventType: 'steal' }] },
  {
    key: 'foul',
    toggleIndex: 7,
    items: [{ key: 'foul', label: 'FOUL', eventType: 'foul' }],
  },
];

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

function renderLegendIcon(item) {
  if (item.type === 'freeThrowMade' || item.type === 'freeThrowMiss') {
    const size = 8;
    const iconPadding = 3;
    const iconViewSize = size + iconPadding * 2;
    const iconCenter = iconViewSize / 2;

    return (
      <svg
        width={iconViewSize}
        height={iconViewSize}
        viewBox={`0 0 ${iconViewSize} ${iconViewSize}`}
        style={{ display: 'inline-block', verticalAlign: 'middle' }}
        aria-hidden="true"
      >
        {renderFreeThrowRing({
          cx: iconCenter,
          cy: iconCenter,
          size: size / 2,
          key: item.key,
          description: item.type === 'freeThrowMiss' ? 'MISS FT 3 of 3' : 'FT 3 of 3',
          subType: item.type === 'freeThrowMiss' ? 'MISS FT 3 of 3' : 'FT 3 of 3',
        })}
      </svg>
    );
  }

  return <LegendShape eventType={item.eventType} size={12} is3PT={item.is3PT} />;
}

function MobilePlayerLegend({ statOn, onToggleStat }) {
  return (
    <section className="mobilePlayerSheetSection" aria-label="Legend">
      <div className="mobilePlayerSheetSectionTitle">Legend</div>
      <div className="mobilePlayerLegend">
        {LEGEND_GROUPS.map((group) => {
          const isOff = Array.isArray(statOn) ? statOn[group.toggleIndex] === false : false;
          const isSubLegend = group.items.length > 1;
          return (
            <button
              key={group.key}
              type="button"
              className={`mobilePlayerLegendGroup${isOff ? ' isOff' : ''}${isSubLegend ? ' isSubLegend' : ''}`}
              onClick={() => onToggleStat?.(group.toggleIndex)}
              aria-pressed={!isOff}
            >
              {isSubLegend ? (
                <div className="mobilePlayerLegendSubRow">
                  {group.items.map((item) => (
                    <div key={item.key} className="mobilePlayerLegendSubItem">
                      <span className="mobilePlayerLegendIcon">{renderLegendIcon(item)}</span>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <span className="mobilePlayerLegendIcon">
                    {renderLegendIcon(group.items[0])}
                  </span>
                  <span>{group.items[0].label}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function MobilePlayerBoxScore({ columns }) {
  if (!columns.length) return null;

  const gridStyle = {
    gridTemplateColumns: `minmax(88px, 1.9fr) repeat(${Math.max(
      0,
      columns.length - 1,
    )}, minmax(42px, 1fr))`,
  };

  return (
    <section className="mobilePlayerSheetSection" aria-label="Box score">
      <div className="mobilePlayerSheetSectionTitle">Box Score</div>
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

function buildMobilePlayerBoxScoreColumns(stats, playerName) {
  const plusMinus = stats.pm === 0 ? '0' : stats.pm > 0 ? `+${stats.pm}` : `${stats.pm}`;

  return [
    { key: 'player', label: 'PLAYER', value: playerName || 'Player' },
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

function MobilePlayerTimelineRows({ periods, actions, timeline, teamColor }) {
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
          teamColor={teamColor}
        />
      ))}
    </div>
  );
}

function MobilePlayerTimelineRow({ period, actions, timeline, pointAtTime, teamColor }) {
  const rowHeight = 34;
  const chartWidth = 320;
  const rowTop = 16;
  const centerY = rowTop + rowHeight / 2;
  const periodDurationSeconds = getPeriodDurationSeconds(period);
  const durationRatio = periodDurationSeconds / REGULATION_PERIOD_SECONDS;
  const rowWidth = Math.max(1, Math.min(chartWidth, chartWidth * durationRatio));
  const rowLeft = (chartWidth - rowWidth) / 2;
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
          size: 4,
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
        4,
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
          style={{ stroke: teamColor || 'var(--text-primary)' }}
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
          y1={centerY}
          x2={rowRight}
          y2={centerY}
          className="mobilePlayerTimelineBaseline"
        />
        <circle cx={rowLeft} cy={centerY} r="2" fill={teamColor} opacity="0.4" />
        <circle cx={rowRight} cy={centerY} r="2" fill={teamColor} opacity="0.4" />
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
  onClose,
}) {
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

  return (
    <section
      className="mobilePlayerSheet"
      aria-label={`${playerDisplayName} detail view`}
      data-testid="mobile-player-sheet"
    >
      <div className="mobilePlayerSheetHeader">
        <div>
          <div className="mobilePlayerSheetEyebrow">
            {periodRange.isFullGame
              ? `Game through ${formatPeriodLabel(periodRange.end)}`
              : formatPeriodLabel(periodRange.start)}
          </div>
          <h2 className="mobilePlayerSheetTitle">{playerDisplayName}</h2>
        </div>
        <button
          type="button"
          className="mobilePlayerSheetClose"
          onClick={onClose}
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
          teamColor={teamColor}
        />
        <MobilePlayerLegend statOn={statOn} onToggleStat={onToggleStat} />
        <MobilePlayerBoxScore columns={boxScoreColumns} />
      </div>
    </section>
  );
}
