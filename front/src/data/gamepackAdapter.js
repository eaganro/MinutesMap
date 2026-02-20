const DEFAULT_NUM_PERIODS = 4;

export const DEFAULT_GAMEPACK_STATE = {
  box: {},
  playByPlay: [],
  awayTeamId: null,
  homeTeamId: null,
  nbaGameId: null,
  numPeriods: DEFAULT_NUM_PERIODS,
  lastAction: null,
  captions: null,
};

export const coerceNbaGameId = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  const raw = String(value).trim();
  return /^\d+$/.test(raw) ? raw : null;
};

export const readPlayMeta = (payload) => {
  if (payload?.v === 2) {
    const last = payload.last;
    return {
      lastAction: last
        ? {
            period: last.quarter ?? last.period,
            clock: last.time ?? last.clock,
            scoreAway: last.awayScore,
            scoreHome: last.homeScore,
          }
        : null,
      numPeriods: payload.periods ?? DEFAULT_NUM_PERIODS,
      captions: payload?.captions && typeof payload.captions === 'object' ? payload.captions : null,
    };
  }

  if (payload?.schemaVersion === 1) {
    return {
      lastAction: payload.lastAction ?? null,
      numPeriods: payload.numPeriods ?? DEFAULT_NUM_PERIODS,
      captions: null,
    };
  }

  return {
    lastAction: null,
    numPeriods: DEFAULT_NUM_PERIODS,
    captions: null,
  };
};

export const unpackGamePackPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return { boxData: null, playData: null };
  }

  if (payload.box || payload.flow) {
    return {
      boxData: payload.box ?? null,
      playData: payload.flow ?? null,
    };
  }

  if (payload.teams && payload.id) {
    return { boxData: payload, playData: null };
  }

  if (payload.v === 2 || payload.schemaVersion === 1) {
    return { boxData: null, playData: payload };
  }

  return { boxData: null, playData: null };
};

export const adaptGamePackPayload = (payload) => {
  const { boxData, playData } = unpackGamePackPayload(payload);
  const { lastAction, numPeriods, captions } = readPlayMeta(playData);

  return {
    boxData,
    playData,
    hasBoxData: Boolean(boxData),
    hasPlayData: Boolean(playData),
    awayTeamId: boxData?.teams?.away?.id ?? null,
    homeTeamId: boxData?.teams?.home?.id ?? null,
    nbaGameId: coerceNbaGameId(payload?.nbaGameId) || coerceNbaGameId(payload?.id),
    lastAction,
    numPeriods,
    captions,
  };
};
