import {
  getFreeThrowAttempt,
  getFreeThrowRingRatio,
  isMissDescription,
} from '../domain/events/classification';

export const EVENT_TYPES = {
  point: {
    label: 'Point',
    colorVar: '--event-point',
    fallback: '#F59E0B',
    shape: 'circle',
  },
  miss: {
    label: 'Miss',
    colorVar: '--event-miss',
    fallback: '#475569',
    shape: 'cross',
  },
  rebound: {
    label: 'Rebound',
    colorVar: '--event-rebound',
    fallback: '#2563EB',
    shape: 'diamond',
  },
  assist: {
    label: 'Assist',
    colorVar: '--event-assist',
    fallback: '#059669',
    shape: 'chevron',
  },
  turnover: {
    label: 'Turnover',
    colorVar: '--event-turnover',
    fallback: '#DC2626',
    shape: 'triangleDown',
  },
  block: {
    label: 'Block',
    colorVar: '--event-block',
    fallback: '#7C3AED',
    shape: 'square',
  },
  steal: {
    label: 'Steal',
    colorVar: '--event-steal',
    fallback: '#0891B2',
    shape: 'triangleUp',
  },
  foul: {
    label: 'Foul',
    colorVar: '--event-foul',
    fallback: '#111827',
    shape: 'hexagon',
  },
};

function getColor(config) {
  return `var(${config.colorVar}, ${config.fallback})`;
}

export function renderFreeThrowRing({
  cx,
  cy,
  size,
  key,
  description,
  subType,
  isAnd1 = false,
  actionNumber = null,
  className = '',
}) {
  const isMiss = isMissDescription(description);
  const strokeWidth = Math.max(1, size * 0.2);
  const { attempt, total } = getFreeThrowAttempt(description, subType);
  const ringRatio = isAnd1 ? 1.15 : getFreeThrowRingRatio(attempt, total);
  let ringRadius = size * ringRatio;
  if (!isAnd1 && total > 1 && attempt === 1) {
    ringRadius = Math.max(0.5, ringRadius - strokeWidth / 2);
  }
  const ringColor = isMiss ? 'var(--event-miss, #475569)' : 'var(--event-point, #F59E0B)';
  const dataAttrs =
    actionNumber !== null
      ? {
          ...(actionNumber !== null ? { 'data-action-number': actionNumber } : {}),
          'data-event-type': 'free-throw',
          style: { cursor: 'pointer' },
        }
      : {};

  return (
    <circle
      key={key}
      cx={cx}
      cy={cy}
      r={ringRadius}
      fill="transparent"
      stroke={ringColor}
      strokeWidth={strokeWidth}
      pointerEvents="all"
      className={className || undefined}
      {...dataAttrs}
    />
  );
}

export function renderEventShape(
  eventType,
  cx,
  cy,
  size,
  key,
  is3PT = false,
  actionNumber = null,
  markerScaleOverride = null,
  className = '',
) {
  const config = EVENT_TYPES[eventType];
  if (!config) return null;

  const color = getColor(config);
  const { shape } = config;
  const s = size;

  const dataAttrs =
    actionNumber !== null
      ? {
          ...(actionNumber !== null ? { 'data-action-number': actionNumber } : {}),
          'data-event-type': eventType,
          style: { cursor: 'pointer' },
        }
      : {};

  const markerColor = 'var(--event-3pt-marker, #DC2626)';
  const markerRadius = s * (markerScaleOverride ?? 0.6);
  const shapeClassName = !is3PT && className ? className : undefined;
  const shapeDataAttrs = is3PT ? {} : dataAttrs;

  const wrapWith3PT = (mainShape) => {
    if (!is3PT) return mainShape;
    return (
      <g key={key} className={className || undefined} {...dataAttrs}>
        {mainShape}
        <circle
          cx={cx}
          cy={cy}
          r={markerRadius}
          fill={markerColor}
          style={{ pointerEvents: 'none' }}
        />
      </g>
    );
  };

  switch (shape) {
    case 'circle': {
      const element = (
        <circle
          key={key}
          cx={cx}
          cy={cy}
          r={s}
          fill={color}
          className={shapeClassName}
          {...shapeDataAttrs}
        />
      );
      return wrapWith3PT(element);
    }

    case 'cross': {
      const t = s * 0.35;
      const path = `
        M ${cx - s} ${cy - s + t}
        L ${cx - t} ${cy}
        L ${cx - s} ${cy + s - t}
        L ${cx - s + t} ${cy + s}
        L ${cx} ${cy + t}
        L ${cx + s - t} ${cy + s}
        L ${cx + s} ${cy + s - t}
        L ${cx + t} ${cy}
        L ${cx + s} ${cy - s + t}
        L ${cx + s - t} ${cy - s}
        L ${cx} ${cy - t}
        L ${cx - s + t} ${cy - s}
        Z
      `;
      const element = (
        <path key={key} d={path} fill={color} className={shapeClassName} {...shapeDataAttrs} />
      );
      return wrapWith3PT(element);
    }

    case 'diamond': {
      const points = `${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`;
      const element = (
        <polygon
          key={key}
          points={points}
          fill={color}
          className={shapeClassName}
          {...shapeDataAttrs}
        />
      );
      return wrapWith3PT(element);
    }

    case 'chevron': {
      const points = `${cx - s * 0.6},${cy - s} ${cx + s},${cy} ${cx - s * 0.6},${cy + s}`;
      const element = (
        <polygon
          key={key}
          points={points}
          fill={color}
          className={shapeClassName}
          {...shapeDataAttrs}
        />
      );
      return wrapWith3PT(element);
    }

    case 'triangleDown': {
      const points = `${cx},${cy + s} ${cx - s},${cy - s * 0.7} ${cx + s},${cy - s * 0.7}`;
      const element = (
        <polygon
          key={key}
          points={points}
          fill={color}
          className={shapeClassName}
          {...shapeDataAttrs}
        />
      );
      return wrapWith3PT(element);
    }

    case 'triangleUp': {
      const points = `${cx},${cy - s} ${cx - s},${cy + s * 0.7} ${cx + s},${cy + s * 0.7}`;
      const element = (
        <polygon
          key={key}
          points={points}
          fill={color}
          className={shapeClassName}
          {...shapeDataAttrs}
        />
      );
      return wrapWith3PT(element);
    }

    case 'square': {
      const element = (
        <rect
          key={key}
          x={cx - s * 0.8}
          y={cy - s * 0.8}
          width={s * 1.6}
          height={s * 1.6}
          fill={color}
          className={shapeClassName}
          {...shapeDataAttrs}
        />
      );
      return wrapWith3PT(element);
    }

    case 'hexagon': {
      const points = [];
      for (let i = 0; i < 6; i++) {
        const angle = (i * 60 - 90) * (Math.PI / 180);
        points.push(`${cx + s * Math.cos(angle)},${cy + s * Math.sin(angle)}`);
      }
      const element = (
        <polygon
          key={key}
          points={points.join(' ')}
          fill={color}
          className={shapeClassName}
          {...shapeDataAttrs}
        />
      );
      return wrapWith3PT(element);
    }

    default: {
      const element = (
        <circle
          key={key}
          cx={cx}
          cy={cy}
          r={s}
          fill={color}
          className={shapeClassName}
          {...shapeDataAttrs}
        />
      );
      return wrapWith3PT(element);
    }
  }
}

export function LegendShape({ eventType, size = 12, is3PT = false }) {
  const config = EVENT_TYPES[eventType];
  if (!config) return null;

  const padding = 2;
  const viewSize = size + padding * 2;
  const center = viewSize / 2;

  return (
    <svg
      width={viewSize}
      height={viewSize}
      viewBox={`0 0 ${viewSize} ${viewSize}`}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      {renderEventShape(eventType, center, center, size / 2, 'legend-shape', is3PT)}
    </svg>
  );
}
