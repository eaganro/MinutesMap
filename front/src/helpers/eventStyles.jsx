/**
 * Event type configuration with distinct shapes and accessible colors.
 * Each event type has a unique shape + color combination to reduce cognitive load
 * and improve accessibility for colorblind users.
 * 
 * Colors use CSS custom properties for dark mode support.
 */

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

/**
 * Get the CSS variable color string
 */
function getColor(config) {
  return `var(${config.colorVar}, ${config.fallback})`;
}

/**
 * Detect event type from action description
 */
export function getEventType(description, actionType = null) {
  if (!description) return null;
  
  if (description.includes('MISS')) return 'miss';
  if (description.includes('PTS')) return 'point';
  if (description.includes('REBOUND')) return 'rebound';
  if (description.includes('AST')) return 'assist';
  if (description.includes('TO)')) return 'turnover';
  if (description.includes('BLK')) return 'block';
  if (description.includes('STL')) return 'steal';
  if (description.includes('PF)') || actionType?.toLowerCase() === 'foul') return 'foul';
  
  return null;
}

const FREE_THROW_PATTERN = /free throw\s+(\d+)\s+of\s+(\d+)/i;

export function isFreeThrowAction(description, actionType = null) {
  const desc = (description || '').toString().toLowerCase();
  const type = (actionType || '').toString().toLowerCase();
  if (type.includes('foul')) return false;
  if (type.includes('free throw')) return true;
  return desc.includes('free throw');
}

const getFreeThrowAttempt = (description, subType) => {
  const text = `${subType || ''} ${description || ''}`;
  const match = text.match(FREE_THROW_PATTERN);
  if (!match) {
    return { attempt: 1, total: 1 };
  }
  return { attempt: Number(match[1]), total: Number(match[2]) };
};

const getFreeThrowRingRatio = (attempt, total) => {
  if (total <= 1) return 0.8;
  if (attempt === 1) return 0.6;
  if (attempt === 2) return 0.8;
  return 1.1;
};

export function renderFreeThrowRing({
  cx,
  cy,
  size,
  key,
  description,
  subType,
  isAnd1 = false,
  actionNumber = null
}) {
  const desc = (description || '').toString().toLowerCase();
  const isMiss = desc.includes('miss');
  const strokeWidth = Math.max(1, size * 0.2);
  const { attempt, total } = getFreeThrowAttempt(description, subType);
  const ringRatio = isAnd1 ? 1.15 : getFreeThrowRingRatio(attempt, total);
  let ringRadius = size * ringRatio;
  if (!isAnd1 && total > 1 && attempt === 1) {
    ringRadius = Math.max(0.5, ringRadius - strokeWidth / 2);
  }
  const ringColor = isMiss
    ? 'var(--event-miss, #475569)'
    : 'var(--event-point, #F59E0B)';
  const dataAttrs = actionNumber !== null ? {
    'data-action-number': actionNumber,
    'data-event-type': 'free-throw',
    style: { cursor: 'pointer' }
  } : {};

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
      {...dataAttrs}
    />
  );
}

/**
 * Render SVG shape for an event type
 * @param {string} eventType - The event type key
 * @param {number} cx - Center X position
 * @param {number} cy - Center Y position
 * @param {number} size - Size of the shape (radius-like)
 * @param {string} key - React key
 * @param {boolean} is3PT - Whether this is a 3-point shot (adds inner marker)
 * @param {number} actionNumber - Optional action number for hover detection
 */
export function renderEventShape(eventType, cx, cy, size, key, is3PT = false, actionNumber = null, markerScaleOverride = null) {
  const config = EVENT_TYPES[eventType];
  if (!config) return null;
  
  const color = getColor(config);
  const { shape } = config;
  const s = size; // shorthand
  
  // Data attributes for hover detection
  const dataAttrs = actionNumber !== null ? {
    'data-action-number': actionNumber,
    'data-event-type': eventType,
    style: { cursor: 'pointer' }
  } : {};
  
  // 3PT marker color also uses CSS variable
  const markerColor = 'var(--event-3pt-marker, #DC2626)';
  const markerRadius = s * (markerScaleOverride ?? 0.6);
  
  // Helper to create a group with optional 3PT marker
  const wrapWith3PT = (mainShape) => {
    if (!is3PT) return mainShape;
    return (
      <g key={key} {...dataAttrs}>
        {mainShape}
        <circle cx={cx} cy={cy} r={markerRadius} fill={markerColor} style={{ pointerEvents: 'none' }} />
      </g>
    );
  };
  
  switch (shape) {
    case 'circle': {
      // Simple circle
      const el = <circle key={key} cx={cx} cy={cy} r={s} fill={color} {...(is3PT ? {} : dataAttrs)} />;
      return wrapWith3PT(el);
    }
    
    case 'cross': {
      // X shape
      const t = s * 0.35; // thickness
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
      const el = <path key={key} d={path} fill={color} {...(is3PT ? {} : dataAttrs)} />;
      return wrapWith3PT(el);
    }
    
    case 'diamond': {
      // Rotated square (diamond)
      const points = `${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`;
      const el = <polygon key={key} points={points} fill={color} {...(is3PT ? {} : dataAttrs)} />;
      return wrapWith3PT(el);
    }
    
    case 'chevron': {
      // Filled right-pointing arrow/triangle
      const points = `${cx - s * 0.6},${cy - s} ${cx + s},${cy} ${cx - s * 0.6},${cy + s}`;
      const el = <polygon key={key} points={points} fill={color} {...(is3PT ? {} : dataAttrs)} />;
      return wrapWith3PT(el);
    }
    
    case 'triangleDown': {
      // Downward pointing triangle
      const points = `${cx},${cy + s} ${cx - s},${cy - s * 0.7} ${cx + s},${cy - s * 0.7}`;
      const el = <polygon key={key} points={points} fill={color} {...(is3PT ? {} : dataAttrs)} />;
      return wrapWith3PT(el);
    }
    
    case 'triangleUp': {
      // Upward pointing triangle
      const points = `${cx},${cy - s} ${cx - s},${cy + s * 0.7} ${cx + s},${cy + s * 0.7}`;
      const el = <polygon key={key} points={points} fill={color} {...(is3PT ? {} : dataAttrs)} />;
      return wrapWith3PT(el);
    }
    
    case 'square': {
      // Simple square
      const el = (
        <rect 
          key={key} 
          x={cx - s * 0.8} 
          y={cy - s * 0.8} 
          width={s * 1.6} 
          height={s * 1.6} 
          fill={color}
          {...(is3PT ? {} : dataAttrs)}
        />
      );
      return wrapWith3PT(el);
    }
    
    case 'hexagon': {
      // Hexagon (stop-sign-like for fouls)
      const points = [];
      for (let i = 0; i < 6; i++) {
        const angle = (i * 60 - 90) * (Math.PI / 180);
        points.push(`${cx + s * Math.cos(angle)},${cy + s * Math.sin(angle)}`);
      }
      const el = <polygon key={key} points={points.join(' ')} fill={color} {...(is3PT ? {} : dataAttrs)} />;
      return wrapWith3PT(el);
    }
    
    default: {
      const el = <circle key={key} cx={cx} cy={cy} r={s} fill={color} {...(is3PT ? {} : dataAttrs)} />;
      return wrapWith3PT(el);
    }
  }
}

/**
 * Render a legend shape (for StatButtons)
 * Returns an SVG element with the shape centered
 */
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
