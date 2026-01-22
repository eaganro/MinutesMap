import { timeToSeconds } from './utils';

// Convert a play event to elapsed seconds from game start (regulation and OT)
export function elapsedSecondsFromStart(ev) {
  const per = Number(ev.period || 1);
  const clock = ev.clock || 'PT12M00.00S';
  const inPeriod = timeToSeconds(clock); // remaining time in period
  const periodLength = per <= 4 ? 12 * 60 : 5 * 60;
  let elapsedBefore = 0;
  if (per <= 4) {
    elapsedBefore = (per - 1) * 12 * 60;
  } else {
    // After regulation, each additional period is 5 minutes
    elapsedBefore = 4 * 12 * 60 + (per - 5) * 5 * 60;
  }
  return Math.max(0, elapsedBefore + (periodLength - inPeriod));
}

function emptyStats() {
  return {
    min: '00:00',
    pts: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    ftm: 0,
    fta: 0,
    oreb: 0,
    dreb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    to: 0,
    pf: 0,
    pm: 0,
  };
}

function formatMinutesFromSeconds(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rs = String(s % 60).padStart(2, '0');
  return `${String(m).padStart(2, '0')}:${rs}`;
}

// Sum seconds overlapped between [segStart, segEnd] and [winStart, winEnd]
function overlapSeconds(segStart, segEnd, winStart, winEnd) {
  const s = Math.max(segStart, winStart);
  const e = Math.min(segEnd, winEnd);
  return Math.max(0, e - s);
}

export function buildPartialBox({ box, playByPlay, range, awayTeamId, homeTeamId, awayPlayerTimeline, homePlayerTimeline }) {
  if (!box || !range || range.start == null || range.end == null) return null;
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);

  const awayTeam = box?.teams?.away;
  const homeTeam = box?.teams?.home;
  const awayId = awayTeam?.id ?? awayTeamId;
  const homeId = homeTeam?.id ?? homeTeamId;

  // Prepare per-team and per-player maps
  const teams = {};
  if (awayId != null) {
    teams[awayId] = {
      team: awayTeam,
      players: new Map(),
      teamId: awayId,
    };
  }
  if (homeId != null) {
    teams[homeId] = {
      team: homeTeam,
      players: new Map(),
      teamId: homeId,
    };
  }

  const seedTeamPlayers = (teamObj, originalPlayers) => {
    if (!teamObj) {
      return;
    }
    (originalPlayers || []).forEach(p => {
      if (p?.id == null) {
        return;
      }
      teamObj.players.set(p.id, {
        ...p,
        stats: emptyStats(),
      });
    });
  };

  seedTeamPlayers(teams[awayId], awayTeam?.players || []);
  seedTeamPlayers(teams[homeId], homeTeam?.players || []);

  // Build name->personId mapping per team from play-by-play
  const normalize = s => (s || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\./g, '')
    .trim()
    .toLowerCase();

  const nameToPid = new Map(); // key: `${teamId}|${normalizedName}` => pid
  const pidCounts = new Map(); // key: `${teamId}|${normalizedName}|${pid}` => count
  (playByPlay || []).forEach(ev => {
    if (!ev || !ev.teamId) return;
    const names = [ev.playerName, ev.playerNameI].filter(Boolean);
    if (names.length === 0) return;
    names.forEach(n => {
      const keyName = `${ev.teamId}|${normalize(n)}`;
      const pidKey = `${keyName}|${ev.personId}`;
      pidCounts.set(pidKey, (pidCounts.get(pidKey) || 0) + 1);
    });
  });
  // Resolve most common pid per name per team
  pidCounts.forEach((count, pidKey) => {
    const [teamNameKey, pidStr] = [pidKey.slice(0, pidKey.lastIndexOf('|')), pidKey.slice(pidKey.lastIndexOf('|') + 1)];
    const cur = nameToPid.get(teamNameKey);
    if (!cur || count > cur.count) {
      nameToPid.set(teamNameKey, { pid: Number(pidStr), count });
    }
  });

  // Aggregate events
  (playByPlay || []).forEach(ev => {
    const t = elapsedSecondsFromStart(ev);
    if (t < start || t > end) return;
    const team = teams[ev.teamId];
    if (!team) return;

    const pid = ev.personId;
    const entry = pid && team.players.get(pid);
    const addStat = (mutator) => { if (entry) mutator(entry.stats); };
    const made = (ev.shotResult || '').toString().toLowerCase() === 'made';
    const type = (ev.actionType || '').toString().toLowerCase();

    switch (type) {
      case '2pt':
      case '3pt': {
        addStat(s => {
          s.fga += 1;
          if (type === '3pt') s.tpa += 1;
          if (made) {
            s.fgm += 1;
            if (type === '3pt') s.tpm += 1;
            s.pts += (type === '3pt') ? 3 : 2; // ignore ev.pointsTotal to avoid double-count via cumulative totals
          }
        });
        // Assist credit lives on scoring play
        if (made && ev.assistPersonId && team.players.has(ev.assistPersonId)) {
          const a = team.players.get(ev.assistPersonId);
          a.stats.ast += 1;
        }
        break;
      }
      case 'freethrow':
      case 'free-throw':
      case 'free_throw':
      case 'freethrowmade':
      case 'freethrowmiss':
      case 'free throw':
      case 'freethrows':
      case 'freeThrow': {
        addStat(s => {
          s.fta += 1;
          if (made) {
            s.ftm += 1;
            s.pts += 1;
          }
        });
        break;
      }
      case 'rebound': {
        addStat(s => {
          if (ev.subType === 'offensive') s.oreb += 1;
          else s.dreb += 1;
        });
        break;
      }
      case 'turnover': {
        addStat(s => { s.to += 1; });
        break;
      }
      case 'steal': {
        addStat(s => { s.stl += 1; });
        break;
      }
      case 'block': {
        addStat(s => { s.blk += 1; });
        break;
      }
      case 'foul': {
        addStat(s => { s.pf += 1; });
        break;
      }
      default:
        break;
    }
  });

  const buildInitialName = (player) => {
    const first = (player?.first || '').trim();
    const last = (player?.last || '').trim();
    if (!first || !last) {
      return '';
    }
    return `${first.charAt(0)}. ${last}`;
  };

  // Compute minutes from overlap of playtime segments
  const computeMinutesForTeam = (teamId, timelines) => {
    Object.entries(timelines || {}).forEach(([name, segs]) => {
      // Map player by name to personId using PBP evidence or fallback to last-name match
      const team = teams[teamId];
      if (!team) return;
      const nrm = normalize(name);
      let entry = null;
      const mapHit = nameToPid.get(`${teamId}|${nrm}`);
      if (mapHit && team.players.has(mapHit.pid)) {
        entry = team.players.get(mapHit.pid);
      } else {
        // Fallback by last name comparison
        const last = nrm.split(' ').slice(-1)[0];
        entry = Array.from(team.players.values()).find(p => (
          normalize(p.last) === last
          || normalize(`${p.first} ${p.last}`) === nrm
          || normalize(buildInitialName(p)) === nrm
        ));
      }
      if (!entry) return;
      // Sum overlap seconds across segments
      let total = 0;
      (segs || []).forEach(seg => {
        const per = Number(seg.period || 1);
        const perLen = per <= 4 ? 12 * 60 : 5 * 60;
        const segStart = elapsedSecondsFromStart({ period: per, clock: seg.start });
        const segEnd = elapsedSecondsFromStart({ period: per, clock: seg.end || `PT00M00.00S` });
        const s = Math.min(segStart, segEnd);
        const e = Math.max(segStart, segEnd);
        total += overlapSeconds(s, e, start, end);
      });
      entry.stats.min = formatMinutesFromSeconds(total);
    });
  };

  computeMinutesForTeam(awayId, awayPlayerTimeline);
  computeMinutesForTeam(homeId, homePlayerTimeline);

  // Build final box-like object with filtered stats
  const buildTeamOut = (origTeam, map) => {
    const safeMap = map || new Map();
    const players = (origTeam?.players || []).map(p => safeMap.get(p.id) || { ...p, stats: emptyStats() });
    const base = origTeam ? { ...origTeam } : {};
    return { ...base, players };
  };

  const awayOut = buildTeamOut(awayTeam, teams[awayId]?.players);
  const homeOut = buildTeamOut(homeTeam, teams[homeId]?.players);

  return {
    start: box.start,
    teams: {
      away: awayOut,
      home: homeOut,
    },
  };
}
