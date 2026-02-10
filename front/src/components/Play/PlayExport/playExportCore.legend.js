import { getCssVar } from './playExportCore.style';
import {
  drawEventShape,
  drawFreeThrowLegendRing,
  drawScoreLeadIcon,
} from './playExportCore.markers';

export const getPeriodCountFromRange = (periodRange, fallback = 4) => {
  const start = Number(periodRange?.start);
  const end = Number(periodRange?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return fallback;
  return Math.max(1, end - start + 1);
};

export const getQuarterAwareLegendScale = (periodCount) => {
  const currentScale = 0.85;
  const q1Scale = 0.6;
  const count = Number(periodCount);
  if (!Number.isFinite(count) || count <= 0) return currentScale;
  if (count >= 4) return currentScale;
  if (count <= 1) return q1Scale;
  const ratio = (count - 1) / 3;
  return q1Scale + (currentScale - q1Scale) * ratio;
};

export const getFullTimelineLegendScale = (periodCount) => {
  const currentScale = 0.85;
  const q1Scale = 0.78;
  const count = Number(periodCount);
  if (!Number.isFinite(count) || count <= 0) return currentScale;
  if (count >= 4) return currentScale;
  if (count <= 1) return q1Scale;
  const ratio = (count - 1) / 3;
  return q1Scale + (currentScale - q1Scale) * ratio;
};

export const getQuarterAwareLegendGap = (periodCount, q1Gap, q4Gap) => {
  const minGap = Number(q1Gap);
  const maxGap = Number(q4Gap);
  if (!Number.isFinite(minGap) || !Number.isFinite(maxGap)) return 0;
  const count = Number(periodCount);
  if (!Number.isFinite(count) || count <= 0) return maxGap;
  if (count >= 4) return maxGap;
  if (count <= 1) return minGap;
  const ratio = (count - 1) / 3;
  return minGap + (maxGap - minGap) * ratio;
};

export const drawLegend = (
  ctx,
  computedStyle,
  startX,
  startY,
  maxWidth,
  allowWrap = false,
  statOn,
  showScoreDiff,
  includeScoreLead = true,
  legendScale = 1,
  forceWrapAfterGroupIndex = null,
) => {
  if (!ctx) return startY;
  const normalizedLegendScale = Number.isFinite(legendScale) && legendScale > 0 ? legendScale : 1;
  const rowHeight = 18 * normalizedLegendScale;
  const rowGap = 8 * normalizedLegendScale;
  const textColor = getCssVar(computedStyle, '--text-secondary', '#6b7280');
  const labelColor = getCssVar(computedStyle, '--stat-label-color', textColor);
  const labelOffColor = getCssVar(computedStyle, '--stat-label-off', '#94a3b8');
  const isStatOn = (index) => (Array.isArray(statOn) ? statOn[index] !== false : true);
  const isScoreLeadOn = showScoreDiff !== false;
  ctx.textBaseline = 'middle';

  const buildRow = ({ iconSize, fontSize, itemGap, groupGap }) => {
    const iconBox = iconSize * 2;
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;

    const createItem = (label, drawIcon, isOff = false) => {
      const labelWidth = ctx.measureText(label).width;
      return {
        label,
        labelWidth,
        drawIcon,
        isOff,
        width: iconBox + 4 + labelWidth,
      };
    };

    const buildGroup = (items) => {
      const total = items.reduce((sum, item) => sum + item.width, 0);
      return {
        items,
        width: total + itemGap * Math.max(0, items.length - 1),
      };
    };

    const drawGroup = (group, x, y) => {
      let cursor = x;
      group.items.forEach((item) => {
        const labelX = cursor + iconBox + 4;
        if (item.isOff) {
          ctx.save();
          ctx.globalAlpha = 0.35;
        }
        item.drawIcon(cursor + iconSize, y - 1);
        ctx.fillStyle = item.isOff ? labelOffColor : labelColor;
        ctx.fillText(item.label, labelX, y + 1);
        if (item.isOff) {
          ctx.restore();
          ctx.strokeStyle = labelOffColor;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(labelX, y + 1);
          ctx.lineTo(labelX + item.labelWidth, y + 1);
          ctx.stroke();
        }
        cursor += item.width + itemGap;
      });
    };

    const pointGroup = buildGroup([
      createItem(
        '2PT',
        (cx, cy) => drawEventShape(ctx, 'point', cx, cy, iconSize, computedStyle, false),
        !isStatOn(0),
      ),
      createItem(
        '3PT',
        (cx, cy) => drawEventShape(ctx, 'point', cx, cy, iconSize, computedStyle, true),
        !isStatOn(0),
      ),
      createItem(
        'FT',
        (cx, cy) => drawFreeThrowLegendRing(ctx, cx, cy, iconSize * 0.95, computedStyle, false),
        !isStatOn(0),
      ),
    ]);
    const missGroup = buildGroup([
      createItem(
        'Miss',
        (cx, cy) => drawEventShape(ctx, 'miss', cx, cy, iconSize, computedStyle, false),
        !isStatOn(1),
      ),
      createItem(
        '3PT',
        (cx, cy) => drawEventShape(ctx, 'miss', cx, cy, iconSize, computedStyle, true),
        !isStatOn(1),
      ),
      createItem(
        'FT',
        (cx, cy) => drawFreeThrowLegendRing(ctx, cx, cy, iconSize * 0.95, computedStyle, true),
        !isStatOn(1),
      ),
    ]);
    const reboundGroup = buildGroup([
      createItem(
        'Rebound',
        (cx, cy) => drawEventShape(ctx, 'rebound', cx, cy, iconSize, computedStyle, false),
        !isStatOn(2),
      ),
    ]);
    const assistGroup = buildGroup([
      createItem(
        'Assist',
        (cx, cy) => drawEventShape(ctx, 'assist', cx, cy, iconSize, computedStyle, false),
        !isStatOn(3),
      ),
    ]);
    const turnoverGroup = buildGroup([
      createItem(
        'Turnover',
        (cx, cy) => drawEventShape(ctx, 'turnover', cx, cy, iconSize, computedStyle, false),
        !isStatOn(4),
      ),
    ]);
    const blockGroup = buildGroup([
      createItem(
        'Block',
        (cx, cy) => drawEventShape(ctx, 'block', cx, cy, iconSize, computedStyle, false),
        !isStatOn(5),
      ),
    ]);
    const stealGroup = buildGroup([
      createItem(
        'Steal',
        (cx, cy) => drawEventShape(ctx, 'steal', cx, cy, iconSize, computedStyle, false),
        !isStatOn(6),
      ),
    ]);
    const foulGroup = buildGroup([
      createItem(
        'Foul',
        (cx, cy) => drawEventShape(ctx, 'foul', cx, cy, iconSize, computedStyle, false),
        !isStatOn(7),
      ),
    ]);
    const groups = [
      pointGroup,
      missGroup,
      reboundGroup,
      assistGroup,
      turnoverGroup,
      blockGroup,
      stealGroup,
      foulGroup,
    ];
    if (includeScoreLead) {
      const scoreLeadGroup = buildGroup([
        createItem(
          'Score Lead',
          (cx, cy) => drawScoreLeadIcon(ctx, cx, cy, iconSize, computedStyle),
          !isScoreLeadOn,
        ),
      ]);
      groups.push(scoreLeadGroup);
    }

    const rowWidth =
      groups.reduce((sum, group) => sum + group.width, 0) +
      groupGap * Math.max(0, groups.length - 1);

    return { groups, rowWidth, drawGroup, groupGap };
  };

  let rowConfig = buildRow({
    iconSize: 6 * normalizedLegendScale,
    fontSize: 11 * normalizedLegendScale,
    itemGap: 10 * normalizedLegendScale,
    groupGap: 16 * normalizedLegendScale,
  });
  if (rowConfig.rowWidth > maxWidth && !allowWrap) {
    rowConfig = buildRow({
      iconSize: 5 * normalizedLegendScale,
      fontSize: 10 * normalizedLegendScale,
      itemGap: 8 * normalizedLegendScale,
      groupGap: 12 * normalizedLegendScale,
    });
  }

  const rowY = startY + rowHeight / 2;

  if (allowWrap) {
    const rows = [[]];
    const rowWidths = [0];
    rowConfig.groups.forEach((group, index) => {
      const rowIndex = rows.length - 1;
      const addWidth = group.width + (rows[rowIndex].length ? rowConfig.groupGap : 0);
      if (rows[rowIndex].length && rowWidths[rowIndex] + addWidth > maxWidth) {
        rows.push([group]);
        rowWidths.push(group.width);
      } else {
        rows[rowIndex].push(group);
        rowWidths[rowIndex] += addWidth;
      }
      if (forceWrapAfterGroupIndex === index && index < rowConfig.groups.length - 1) {
        rows.push([]);
        rowWidths.push(0);
      }
    });

    rows.forEach((row, index) => {
      const width = rowWidths[index];
      const rowStart = startX + Math.max(0, (maxWidth - width) / 2);
      let cursor = rowStart;
      const y = rowY + index * (rowHeight + rowGap);
      row.forEach((group, groupIndex) => {
        rowConfig.drawGroup(group, cursor, y);
        cursor += group.width + (groupIndex < row.length - 1 ? rowConfig.groupGap : 0);
      });
    });

    return rowY + (rows.length - 1) * (rowHeight + rowGap) + rowHeight / 2;
  }

  const rowStart = startX + Math.max(0, (maxWidth - rowConfig.rowWidth) / 2);
  const scale = rowConfig.rowWidth > maxWidth ? maxWidth / rowConfig.rowWidth : 1;

  ctx.save();
  if (scale !== 1) {
    ctx.translate(rowStart, 0);
    ctx.scale(scale, 1);
    let cursor = 0;
    rowConfig.groups.forEach((group, index) => {
      rowConfig.drawGroup(group, cursor, rowY);
      cursor += group.width + (index < rowConfig.groups.length - 1 ? rowConfig.groupGap : 0);
    });
  } else {
    let cursor = rowStart;
    rowConfig.groups.forEach((group, index) => {
      rowConfig.drawGroup(group, cursor, rowY);
      cursor += group.width + (index < rowConfig.groups.length - 1 ? rowConfig.groupGap : 0);
    });
  }
  ctx.restore();

  return rowY + rowHeight / 2;
};

export const measureLegendHeight = (
  ctx,
  computedStyle,
  maxWidth,
  allowWrap = false,
  statOn,
  showScoreDiff,
  includeScoreLead = true,
  legendScale = 1,
  forceWrapAfterGroupIndex = null,
) => {
  if (!ctx) return 0;
  const normalizedLegendScale = Number.isFinite(legendScale) && legendScale > 0 ? legendScale : 1;
  const rowHeight = 18 * normalizedLegendScale;
  const rowGap = 8 * normalizedLegendScale;
  const isStatOn = (index) => (Array.isArray(statOn) ? statOn[index] !== false : true);
  const isScoreLeadOn = showScoreDiff !== false;

  const buildRow = ({ iconSize, fontSize, itemGap, groupGap }) => {
    const iconBox = iconSize * 2;
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;

    const createItem = (label, isOff = false) => {
      const labelWidth = ctx.measureText(label).width;
      return {
        label,
        labelWidth,
        isOff,
        width: iconBox + 4 + labelWidth,
      };
    };

    const buildGroup = (items) => {
      const total = items.reduce((sum, item) => sum + item.width, 0);
      return {
        items,
        width: total + itemGap * Math.max(0, items.length - 1),
      };
    };

    const pointGroup = buildGroup([
      createItem('2PT', !isStatOn(0)),
      createItem('3PT', !isStatOn(0)),
      createItem('FT', !isStatOn(0)),
    ]);
    const missGroup = buildGroup([
      createItem('Miss', !isStatOn(1)),
      createItem('3PT', !isStatOn(1)),
      createItem('FT', !isStatOn(1)),
    ]);
    const reboundGroup = buildGroup([createItem('Rebound', !isStatOn(2))]);
    const assistGroup = buildGroup([createItem('Assist', !isStatOn(3))]);
    const turnoverGroup = buildGroup([createItem('Turnover', !isStatOn(4))]);
    const blockGroup = buildGroup([createItem('Block', !isStatOn(5))]);
    const stealGroup = buildGroup([createItem('Steal', !isStatOn(6))]);
    const foulGroup = buildGroup([createItem('Foul', !isStatOn(7))]);
    const groups = [
      pointGroup,
      missGroup,
      reboundGroup,
      assistGroup,
      turnoverGroup,
      blockGroup,
      stealGroup,
      foulGroup,
    ];
    if (includeScoreLead) {
      const scoreLeadGroup = buildGroup([createItem('Score Lead', !isScoreLeadOn)]);
      groups.push(scoreLeadGroup);
    }

    const rowWidth =
      groups.reduce((sum, group) => sum + group.width, 0) +
      groupGap * Math.max(0, groups.length - 1);

    return { groups, rowWidth, groupGap };
  };

  let rowConfig = buildRow({
    iconSize: 6 * normalizedLegendScale,
    fontSize: 11 * normalizedLegendScale,
    itemGap: 10 * normalizedLegendScale,
    groupGap: 16 * normalizedLegendScale,
  });
  if (rowConfig.rowWidth > maxWidth && !allowWrap) {
    rowConfig = buildRow({
      iconSize: 5 * normalizedLegendScale,
      fontSize: 10 * normalizedLegendScale,
      itemGap: 8 * normalizedLegendScale,
      groupGap: 12 * normalizedLegendScale,
    });
  }

  if (!allowWrap) {
    return rowHeight;
  }

  const rows = [[]];
  const rowWidths = [0];
  rowConfig.groups.forEach((group, index) => {
    const rowIndex = rows.length - 1;
    const addWidth = group.width + (rows[rowIndex].length ? rowConfig.groupGap : 0);
    if (rows[rowIndex].length && rowWidths[rowIndex] + addWidth > maxWidth) {
      rows.push([group]);
      rowWidths.push(group.width);
    } else {
      rows[rowIndex].push(group);
      rowWidths[rowIndex] += addWidth;
    }
    if (forceWrapAfterGroupIndex === index && index < rowConfig.groups.length - 1) {
      rows.push([]);
      rowWidths.push(0);
    }
  });

  const rowCount = rows.length || 1;
  return rowHeight * rowCount + rowGap * Math.max(0, rowCount - 1);
};
