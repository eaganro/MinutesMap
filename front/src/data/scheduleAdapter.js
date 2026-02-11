const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const normalizeSchedulePayload = (payload) => {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      if (entry.id === undefined || entry.id === null) {
        return entry;
      }
      return {
        ...entry,
        id: String(entry.id),
      };
    });
};

export const normalizeInitPayload = (payload, { fallbackDate }) => {
  const rawDate = typeof payload?.date === 'string' ? payload.date.trim() : '';
  const date = ISO_DATE_RE.test(rawDate) ? rawDate : fallbackDate;

  const rawAutoSelectGameId =
    typeof payload?.autoSelectGameId === 'string' ? payload.autoSelectGameId.trim() : '';

  return {
    date,
    autoSelectGameId: rawAutoSelectGameId || null,
  };
};
