import {
  getPeriodDurationSeconds,
  getPeriodStartSeconds,
  getSecondsElapsed,
} from '../../../helpers/playTimeline';
import {
  getEventType,
  isFreeThrowAction,
  isThreePointAction,
} from '../../../domain/events/classification';
import {
  BOX_HIGHLIGHT_KEYS,
  BOX_TABLE_FONT_HEADER,
  BOX_TABLE_FONT_VALUE,
  BOX_TABLE_HEADER_HEIGHT,
  BOX_TABLE_PADDING_X,
  BOX_TABLE_ROW_HEIGHT,
} from './playExportCore.constants';
import { getCssVar, truncateText } from './playExportCore.style';

export const drawBoxScoreTable = (
  ctx,
  computedStyle,
  columns,
  startX,
  startY,
  maxWidth,
  options = {},
) => {
  if (!ctx || !columns || !columns.length) return 0;
  const textHeading = getCssVar(computedStyle, '--text-heading', '#374151');
  const textPrimary = getCssVar(computedStyle, '--text-primary', '#111111');
  const textSecondary = getCssVar(computedStyle, '--text-secondary', '#6b7280');
  const headerBg = getCssVar(computedStyle, '--bg-table-header', '#ffffff');
  const rowBg = getCssVar(computedStyle, '--bg-table-even', '#f9fafb');
  const highlightHeaderBg = getCssVar(computedStyle, '--bg-highlight-col-header', '#dbeafe');
  const highlightBg = getCssVar(computedStyle, '--bg-highlight-col', '#eff6ff');
  const dividerColor = getCssVar(computedStyle, '--divider', '#e5e7eb');

  const statCount = Math.max(1, columns.length - 1);
  const minStatWidth = 30;
  const minPlayerWidth = 70;
  const maxPlayerWidth = 160;
  let playerWidth = Math.min(maxPlayerWidth, Math.max(90, maxWidth * 0.28));
  let widths = [];

  if (options?.statWeights && columns.length > 1) {
    const statWeights = columns.slice(1).map((col) => {
      const weight = Number(options.statWeights[col.key]);
      return Number.isFinite(weight) && weight > 0 ? weight : 1;
    });
    const totalWeight = statWeights.reduce((sum, weight) => sum + weight, 0);
    const minWeight = Math.min(...statWeights);
    if (
      Number.isFinite(totalWeight) &&
      totalWeight > 0 &&
      Number.isFinite(minWeight) &&
      minWeight > 0
    ) {
      let availableWidth = maxWidth - playerWidth;
      const requiredAvailable = (minStatWidth * totalWeight) / minWeight;
      if (availableWidth < requiredAvailable) {
        playerWidth = Math.max(minPlayerWidth, maxWidth - requiredAvailable);
        availableWidth = maxWidth - playerWidth;
      }
      widths = [
        playerWidth,
        ...statWeights.map((weight) => (availableWidth * weight) / totalWeight),
      ];
    }
  }

  if (!widths.length) {
    let statWidth = (maxWidth - playerWidth) / statCount;
    if (statWidth < minStatWidth) {
      playerWidth = Math.max(minPlayerWidth, maxWidth - statCount * minStatWidth);
      statWidth = (maxWidth - playerWidth) / statCount;
    }
    widths = columns.map((_, index) => (index === 0 ? playerWidth : statWidth));
  }

  const headerTop = startY;
  const rowTop = headerTop + BOX_TABLE_HEADER_HEIGHT;

  ctx.fillStyle = headerBg;
  ctx.fillRect(startX, headerTop, maxWidth, BOX_TABLE_HEADER_HEIGHT);
  ctx.fillStyle = rowBg;
  ctx.fillRect(startX, rowTop, maxWidth, BOX_TABLE_ROW_HEIGHT);

  let cursorX = startX;
  columns.forEach((col, index) => {
    const width = widths[index];
    const isHighlight = BOX_HIGHLIGHT_KEYS.has(col.key);
    if (isHighlight) {
      ctx.fillStyle = highlightHeaderBg;
      ctx.fillRect(cursorX, headerTop, width, BOX_TABLE_HEADER_HEIGHT);
      ctx.fillStyle = highlightBg;
      ctx.fillRect(cursorX, rowTop, width, BOX_TABLE_ROW_HEIGHT);
    }

    ctx.textBaseline = 'middle';
    ctx.font = BOX_TABLE_FONT_HEADER;
    ctx.fillStyle = textHeading;
    ctx.textAlign = index === 0 ? 'left' : 'center';
    const headerX = index === 0 ? cursorX + BOX_TABLE_PADDING_X : cursorX + width / 2;
    ctx.fillText(col.label, headerX, headerTop + BOX_TABLE_HEADER_HEIGHT / 2);

    ctx.font = BOX_TABLE_FONT_VALUE;
    ctx.fillStyle = index === 0 ? textSecondary : textPrimary;
    const valueText =
      index === 0 ? truncateText(ctx, col.value, width - BOX_TABLE_PADDING_X * 2) : col.value;
    const valueX = index === 0 ? cursorX + BOX_TABLE_PADDING_X : cursorX + width / 2;
    ctx.fillText(valueText, valueX, rowTop + BOX_TABLE_ROW_HEIGHT / 2);

    cursorX += width;
  });

  ctx.strokeStyle = dividerColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(startX, rowTop);
  ctx.lineTo(startX + maxWidth, rowTop);
  ctx.stroke();

  ctx.textAlign = 'left';
  return BOX_TABLE_HEADER_HEIGHT + BOX_TABLE_ROW_HEIGHT;
};

const formatMinutesSeconds = (totalSeconds) => {
  const total = Math.max(0, Math.round(totalSeconds || 0));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export const computePlayerBoxScore = ({
  actions,
  timeline,
  scoreTimeline,
  displayScoreTimeline,
  periodRange,
  teamKey,
}) => {
  const stats = {
    seconds: 0,
    pts: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    ftm: 0,
    fta: 0,
    reb: 0,
    oreb: 0,
    dreb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    to: 0,
    pf: 0,
    pm: 0,
  };

  (timeline || []).forEach((entry) => {
    if (!entry?.start || !entry?.end) return;
    const start = getSecondsElapsed(entry.period, entry.start);
    const end = getSecondsElapsed(entry.period, entry.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    const duration = Math.max(0, end - start);
    stats.seconds += duration;
  });

  (actions || []).forEach((action) => {
    const type = (action?.actionType || '').toString().toLowerCase();
    const desc = (action?.description || '').toString().toLowerCase();
    const result = (action?.result || '').toString().toLowerCase();
    const eventType = getEventType(desc, type, result);
    const isShotEvent = eventType === 'point' || eventType === 'miss';
    if (isShotEvent) {
      const isFreeThrow = isFreeThrowAction(desc, type);
      const isThree = isThreePointAction(desc, type);
      if (isFreeThrow) {
        stats.fta += 1;
        if (eventType === 'point') {
          stats.ftm += 1;
          stats.pts += 1;
        }
        return;
      }
      stats.fga += 1;
      if (isThree) {
        stats.tpa += 1;
      }
      if (eventType === 'point') {
        stats.fgm += 1;
        stats.pts += isThree ? 3 : 2;
        if (isThree) {
          stats.tpm += 1;
        }
      }
      return;
    }
    if (eventType === 'rebound') {
      stats.reb += 1;
      if (desc.includes('offensive rebound') || desc.includes('off. rebound')) {
        stats.oreb += 1;
      } else if (desc.includes('defensive rebound') || desc.includes('def. rebound')) {
        stats.dreb += 1;
      }
    } else if (eventType === 'assist') {
      stats.ast += 1;
    } else if (eventType === 'steal') {
      stats.stl += 1;
    } else if (eventType === 'block') {
      stats.blk += 1;
    } else if (eventType === 'turnover') {
      stats.to += 1;
    } else if (eventType === 'foul') {
      stats.pf += 1;
    }
  });

  if (teamKey) {
    const segments = (timeline || [])
      .map((entry) => {
        if (!entry?.start || !entry?.end) return null;
        const start = getSecondsElapsed(entry.period, entry.start);
        const end = getSecondsElapsed(entry.period, entry.end);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
        const s = Math.min(start, end);
        const e = Math.max(start, end);
        return { start: s, end: e };
      })
      .filter(Boolean);
    const isOnCourt = (elapsed) =>
      segments.some((seg) => elapsed >= seg.start && elapsed <= seg.end);

    const rangeStart = Number(periodRange?.start);
    const rangeEnd = Number(periodRange?.end);
    const rangeStartSeconds = Number.isFinite(rangeStart) ? getPeriodStartSeconds(rangeStart) : 0;
    const rangeEndSeconds = Number.isFinite(rangeEnd)
      ? getPeriodStartSeconds(rangeEnd) + getPeriodDurationSeconds(rangeEnd)
      : Infinity;

    const scoreSource =
      displayScoreTimeline && displayScoreTimeline.length
        ? displayScoreTimeline
        : scoreTimeline || [];
    const scored = (scoreSource || [])
      .map((entry) => {
        const elapsed = getSecondsElapsed(entry.period, entry.clock);
        if (!Number.isFinite(elapsed)) return null;
        return { ...entry, elapsed };
      })
      .filter(Boolean)
      .sort((a, b) => a.elapsed - b.elapsed);

    let prev = null;
    scored.forEach((entry) => {
      if (entry.elapsed <= rangeStartSeconds) {
        prev = entry;
      }
    });

    scored
      .filter((entry) => entry.elapsed >= rangeStartSeconds && entry.elapsed <= rangeEndSeconds)
      .forEach((entry) => {
        if (!prev) {
          prev = entry;
          return;
        }
        const deltaAway = Number(entry.away) - Number(prev.away);
        const deltaHome = Number(entry.home) - Number(prev.home);
        if (deltaAway || deltaHome) {
          if (isOnCourt(entry.elapsed)) {
            stats.pm += teamKey === 'away' ? deltaAway - deltaHome : deltaHome - deltaAway;
          }
        }
        prev = entry;
      });
  }

  return stats;
};

export const buildBoxScoreColumns = (stats, playerName, includeAttempts) => {
  const plusMinus = stats.pm === 0 ? '0' : stats.pm > 0 ? `+${stats.pm}` : `${stats.pm}`;
  const columns = [
    { key: 'player', label: 'PLAYER', value: playerName || 'Player' },
    { key: 'min', label: 'MIN', value: formatMinutesSeconds(stats.seconds) },
    { key: 'pts', label: 'PTS', value: `${stats.pts}` },
  ];
  if (includeAttempts) {
    columns.push(
      { key: 'fg', label: 'FG', value: `${stats.fgm}-${stats.fga}` },
      { key: '3p', label: '3P', value: `${stats.tpm}-${stats.tpa}` },
      { key: 'ft', label: 'FT', value: `${stats.ftm}-${stats.fta}` },
    );
  }
  columns.push(
    { key: 'reb', label: 'REB', value: `${stats.reb}` },
    { key: 'ast', label: 'AST', value: `${stats.ast}` },
    { key: 'stl', label: 'STL', value: `${stats.stl}` },
    { key: 'blk', label: 'BLK', value: `${stats.blk}` },
    { key: 'to', label: 'TO', value: `${stats.to}` },
    { key: 'pf', label: 'PF', value: `${stats.pf}` },
    { key: 'pm', label: '+/-', value: plusMinus },
  );
  return columns;
};
