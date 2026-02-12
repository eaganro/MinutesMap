import { useMemo } from 'react';
import { timeToSeconds } from '../../../helpers/utils';

const REGULATION_PERIOD_SECONDS = 12 * 60;
const OVERTIME_PERIOD_SECONDS = 5 * 60;

const parseScoreValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeScoreTimeline = (scoreTimeline) => {
  return (scoreTimeline || [])
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const period = Number(entry.quarter ?? entry.period);
      const timeSec = timeToSeconds(entry.time ?? entry.clock);
      const home = parseScoreValue(entry.homeScore ?? entry.home);
      const away = parseScoreValue(entry.awayScore ?? entry.away);
      if (!Number.isFinite(period) || !Number.isFinite(timeSec)) return null;
      if (home === null || away === null) return null;
      return { period, timeSec, home, away };
    })
    .filter(Boolean)
    .sort((a, b) => a.period - b.period || b.timeSec - a.timeSec);
};

const buildScoreLookup = (scoreTimeline, numPeriods) => {
  const normalized = normalizeScoreTimeline(scoreTimeline);
  const entriesByPeriod = new Map();
  for (const entry of normalized) {
    if (!entriesByPeriod.has(entry.period)) {
      entriesByPeriod.set(entry.period, []);
    }
    entriesByPeriod.get(entry.period).push(entry);
  }

  const maxPeriod = Math.max(Number(numPeriods) || 0, ...Array.from(entriesByPeriod.keys()), 0);

  const periodStartScores = new Map();
  let runningHome = 0;
  let runningAway = 0;

  for (let period = 1; period <= maxPeriod; period += 1) {
    periodStartScores.set(period, { home: runningHome, away: runningAway });
    const entries = entriesByPeriod.get(period);
    if (entries && entries.length) {
      const lastEntry = entries[entries.length - 1];
      runningHome = lastEntry.home;
      runningAway = lastEntry.away;
    }
  }

  const getDiffAt = (period, timeSec) => {
    const p = Number(period) || 1;
    const base = periodStartScores.get(p) || { home: 0, away: 0 };
    let home = base.home;
    let away = base.away;
    const entries = entriesByPeriod.get(p);
    if (entries && entries.length) {
      for (const entry of entries) {
        if (entry.timeSec >= timeSec) {
          home = entry.home;
          away = entry.away;
        } else {
          break;
        }
      }
    }
    return home - away;
  };

  return { getDiffAt };
};

const normalizePlayerSegments = (playerTimeline) => {
  const segmentsByPeriod = new Map();

  Object.entries(playerTimeline || {}).forEach(([player, segments]) => {
    (segments || []).forEach((segment) => {
      if (!segment || typeof segment !== 'object') return;
      const period = Number(segment.quarter ?? segment.period);
      const startSec = timeToSeconds(segment.start);
      const endSec = timeToSeconds(segment.end);
      if (!Number.isFinite(period) || !Number.isFinite(startSec) || !Number.isFinite(endSec)) {
        return;
      }
      if (!segmentsByPeriod.has(period)) {
        segmentsByPeriod.set(period, { segments: new Map(), boundaries: new Set() });
      }
      const periodData = segmentsByPeriod.get(period);
      if (!periodData.segments.has(player)) {
        periodData.segments.set(player, []);
      }
      periodData.segments.get(player).push({ startSec, endSec });
      periodData.boundaries.add(startSec);
      periodData.boundaries.add(endSec);
    });
  });

  return segmentsByPeriod;
};

const buildLineupsForTeam = (playerTimeline, scoreLookup, isHome) => {
  if (!playerTimeline || typeof playerTimeline !== 'object') return [];
  const segmentsByPeriod = normalizePlayerSegments(playerTimeline);
  if (!segmentsByPeriod.size) return [];

  const lineupMap = new Map();

  segmentsByPeriod.forEach((periodData, period) => {
    const periodLength = period <= 4 ? REGULATION_PERIOD_SECONDS : OVERTIME_PERIOD_SECONDS;
    periodData.boundaries.add(periodLength);

    const boundaries = Array.from(periodData.boundaries)
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => b - a);

    if (boundaries.length < 2) return;

    for (let i = 0; i < boundaries.length - 1; i += 1) {
      const intervalStart = boundaries[i];
      const intervalEnd = boundaries[i + 1];
      if (intervalStart <= intervalEnd) continue;

      const playersOn = [];
      periodData.segments.forEach((segments, player) => {
        const isOn = (segments || []).some((segment) => {
          const segStart = Math.max(segment.startSec, segment.endSec);
          const segEnd = Math.min(segment.startSec, segment.endSec);
          return segStart >= intervalStart && segEnd <= intervalEnd;
        });
        if (isOn) playersOn.push(player);
      });

      playersOn.sort((a, b) => a.localeCompare(b));
      const key = playersOn.join(' | ');
      const duration = intervalStart - intervalEnd;
      const diffStart = scoreLookup.getDiffAt(period, intervalStart);
      const diffEnd = scoreLookup.getDiffAt(period, intervalEnd);
      const delta = diffEnd - diffStart;
      const plusMinus = isHome ? delta : -delta;

      if (!lineupMap.has(key)) {
        lineupMap.set(key, {
          key,
          players: playersOn,
          seconds: 0,
          plusMinus: 0,
        });
      }
      const current = lineupMap.get(key);
      current.seconds += duration;
      current.plusMinus += plusMinus;
    }
  });

  return Array.from(lineupMap.values());
};

export function useLineupStats({
  awayPlayerTimeline,
  homePlayerTimeline,
  scoreTimeline,
  numPeriods,
}) {
  return useMemo(() => {
    if (!awayPlayerTimeline && !homePlayerTimeline) {
      return { away: [], home: [] };
    }
    const scoreLookup = buildScoreLookup(scoreTimeline, numPeriods);
    return {
      away: buildLineupsForTeam(awayPlayerTimeline, scoreLookup, false),
      home: buildLineupsForTeam(homePlayerTimeline, scoreLookup, true),
    };
  }, [awayPlayerTimeline, homePlayerTimeline, scoreTimeline, numPeriods]);
}
