const ET_TIME_ZONE = 'America/New_York';

function getTimeZoneParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function getTimeZoneOffset(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return (asUtc - date.getTime()) / 60000;
}

export function formatDateString(dateObj) {
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${dateObj.getFullYear()}-${month}-${day}`;
}

export function getTodayString() {
  return formatDateString(new Date());
}

export function getNbaTodayString(now = new Date()) {
  const parts = getTimeZoneParts(now, ET_TIME_ZONE);
  let year = parts.year;
  let month = parts.month;
  let day = parts.day;

  if (parts.hour < 4) {
    const prevUtc = Date.UTC(year, month - 1, day) - 24 * 60 * 60 * 1000;
    const prev = new Date(prevUtc);
    year = prev.getUTCFullYear();
    month = prev.getUTCMonth() + 1;
    day = prev.getUTCDate();
  }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function parseStartTimeEt(startTime) {
  if (!startTime || typeof startTime !== 'string') {
    return null;
  }

  let ts = startTime.trim();
  if (!ts) {
    return null;
  }

  const hasOffset = /([zZ]|[+-]\d{2}:?\d{2})$/.test(ts);
  const hasZulu = /[zZ]$/.test(ts);

  if (hasOffset && !hasZulu) {
    const parsed = new Date(ts);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (hasZulu) {
    ts = ts.slice(0, -1);
  }

  const match = ts.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    const parsed = new Date(ts);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || '0');

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMinutes = getTimeZoneOffset(new Date(utcGuess), ET_TIME_ZONE);
  const utcTime = utcGuess - offsetMinutes * 60000;
  const parsed = new Date(utcTime);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function shiftDateString(dateString, offset) {
  if (!dateString) {
    return null;
  }
  const base = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(base.getTime())) {
    return null;
  }
  base.setDate(base.getDate() + offset);
  return formatDateString(base);
}
