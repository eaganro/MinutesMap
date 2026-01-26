export function timeToSeconds(time) {
  if (!time || typeof time !== 'string') return 0;
  const match = time.match(/^(?:PT)?(\d+)M(\d+)(?:\.(\d+))?S?$/);
  
  if (match) {
    const minutes = parseInt(match[1] || 0);
    const seconds = parseInt(match[2] || 0);
    const milliseconds = parseInt(match[3] || 0);
    return minutes * 60 + seconds + milliseconds / 100;
  }

  const colonMatch = time.match(/^(\d+):(\d+)(?:\.(\d+))?$/);
  if (colonMatch) {
    const minutes = parseInt(colonMatch[1] || 0);
    const seconds = parseInt(colonMatch[2] || 0);
    const milliseconds = parseInt(colonMatch[3] || 0);
    return minutes * 60 + seconds + milliseconds / 100;
  }

  const compactMatch = time.match(/^(\d+)(\d{2})(?:\.(\d+))?$/);
  if (compactMatch) {
    const minutes = parseInt(compactMatch[1] || 0);
    const seconds = parseInt(compactMatch[2] || 0);
    const milliseconds = parseInt(compactMatch[3] || 0);
    return minutes * 60 + seconds + milliseconds / 100;
  }
  
  return 0;
}

// Format a clock like "PT08M13.00S" or "0813.00" to "8:13"
export function formatClock(clock) {
  if (!clock || typeof clock !== 'string') return '';
  const match = clock.match(/^(?:PT)?(\d+)M(\d+)(?:\.(\d+))?S?$/);
  if (match) {
    const minutes = parseInt(match[1] || '0', 10);
    const seconds = parseInt(match[2] || '0', 10);
    const s = String(seconds).padStart(2, '0');
    return `${minutes}:${s}`;
  }
  const compactMatch = clock.match(/^(\d+)(\d{2})(?:\.(\d+))?$/);
  if (compactMatch) {
    const minutes = parseInt(compactMatch[1] || '0', 10);
    const seconds = parseInt(compactMatch[2] || '0', 10);
    const s = String(seconds).padStart(2, '0');
    return `${minutes}:${s}`;
  }
  const colonMatch = clock.match(/^(\d+):(\d+)(?:\.(\d+))?$/);
  if (colonMatch) {
    const minutes = parseInt(colonMatch[1] || '0', 10);
    const seconds = parseInt(colonMatch[2] || '0', 10);
    const s = String(seconds).padStart(2, '0');
    return `${minutes}:${s}`;
  }
  return clock;
}

// Format NBA period number to label: 1..4 => Q1..Q4, 5+ => OT, 2OT, 3OT, ...
export function formatPeriod(period) {
  const p = Number(period);
  if (!Number.isFinite(p) || p <= 0) return '';
  if (p <= 4) return `Q${p}`;
  const otNum = p - 4;
  return otNum === 1 ? 'OT' : `${otNum}OT`;
}

export function fixPlayerName(a) {
  let playerName = a.playerName;
  let nameLoc = a.description.indexOf(a.playerName);
  if (nameLoc > 0 && a.description[nameLoc - 2] === '.') {
    playerName = a.description.slice(a.description.slice(0, nameLoc - 2).lastIndexOf(' ') + 1, nameLoc + a.playerName.length);
  }
  return playerName;
}

export function formatStatusText(status) {
  if (!status || typeof status !== 'string') return '';
  const trimmed = status.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower === 'ppd' || lower === 'postponed') {
    return 'Postponed';
  }
  if (lower === 'canceled' || lower === 'cancelled') {
    return 'Canceled';
  }
  return trimmed.replace(/\s+:(\d{2}(?:\.\d+)?)/g, ' 0:$1');
}
