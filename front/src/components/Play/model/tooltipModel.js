import { getEventType, isFreeThrowAction } from '../../../domain/events/classification';

const FREE_THROW_ORDER_PATTERN = /\b(?:ft|free throw)\b\s*(\d+)\s*(?:of|\/)\s*(\d+)/i;

export function getEventPriority(action) {
  const eventType = getEventType(action?.description, action?.actionType, action?.result);
  if (eventType === 'point') return 0;
  if (eventType === 'assist') return 1;
  if (eventType === 'rebound') return 2;
  return 3;
}

export function isSubstitutionAction(action) {
  const type = (action?.actionType || '').toString().toLowerCase();
  if (type === 'substitution') return true;
  const desc = (action?.description || '').toString().toLowerCase();
  return desc.startsWith('sub');
}

export function getActionOrderValue(action) {
  if (!action) return -Infinity;
  const actionNumber = action.actionNumber;
  if (actionNumber !== undefined && actionNumber !== null) {
    const parsed = parseInt(actionNumber, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return -Infinity;
}

export function getFreeThrowOrderValue(action) {
  if (!action) return null;
  const text = `${action?.subType || ''} ${action?.description || ''}`;
  const match = text.match(FREE_THROW_ORDER_PATTERN);
  if (!match) return null;
  const attempt = Number(match[1]);
  if (Number.isNaN(attempt)) return null;
  return attempt;
}

export function compareTeamActions(a, b) {
  const aIsFT = isFreeThrowAction(a?.description, a?.actionType);
  const bIsFT = isFreeThrowAction(b?.description, b?.actionType);
  if (aIsFT && bIsFT) {
    const aAttempt = getFreeThrowOrderValue(a);
    const bAttempt = getFreeThrowOrderValue(b);
    if (aAttempt !== null && bAttempt !== null && aAttempt !== bAttempt) {
      return aAttempt - bAttempt;
    }
    const aSeq = getActionOrderValue(a);
    const bSeq = getActionOrderValue(b);
    if (aSeq !== bSeq) return aSeq - bSeq;
  }

  const priorityDiff = getEventPriority(a) - getEventPriority(b);
  if (priorityDiff !== 0) return priorityDiff;

  const aSeq = getActionOrderValue(a);
  const bSeq = getActionOrderValue(b);
  if (aSeq !== bSeq) return aSeq - bSeq;
  return 0;
}

export function pickLatestAction(actions) {
  return (actions || []).reduce(
    (best, current) => (getActionOrderValue(current) > getActionOrderValue(best) ? current : best),
    actions?.[0],
  );
}

export function parseSubstitutionNames(description) {
  const raw = (description || '').toString().trim();
  if (!raw) return null;

  const cleanName = (text) => (text || '').replace(/^[\s,:-]+|[\s,;.-]+$/g, '').trim();

  const inMatch = raw.match(/sub\s*in\s*[:\-–]?\s*(.*)/i);
  const outMatch = raw.match(/sub\s*out\s*[:\-–]?\s*(.*)/i);
  if (inMatch || outMatch) {
    const inPlayer = cleanName(inMatch ? inMatch[1] : '');
    const outPlayer = cleanName(outMatch ? outMatch[1] : '');
    if (!inPlayer && !outPlayer) return null;
    return { inPlayer, outPlayer };
  }

  const fullMatch = raw.match(/sub\s*[:\-–]?\s*(.*?)\s*for\s*(.*)/i);
  if (fullMatch) {
    const inPlayer = cleanName(fullMatch[1]);
    const outPlayer = cleanName(fullMatch[2]);
    if (!inPlayer && !outPlayer) return null;
    return { inPlayer, outPlayer };
  }

  const cleaned = raw.replace(/^sub\s*[:\-–]?\s*/i, '');
  const parts = cleaned.split(/\s+for\s+/i);
  if (parts.length > 1) {
    const inPlayer = cleanName(parts[0]);
    const outPlayer = cleanName(parts.slice(1).join(' for '));
    if (!inPlayer && !outPlayer) return null;
    return { inPlayer, outPlayer };
  }

  const inPlayer = cleanName(cleaned);
  if (!inPlayer) return null;
  return { inPlayer, outPlayer: '' };
}

export function uniqueList(items) {
  const seen = new Set();
  const result = [];
  (items || []).forEach((item) => {
    const text = (item || '').trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    result.push(text);
  });
  return result;
}

export function groupTooltipItemsByTeam({ descriptionArray, awayTeamAbr }) {
  const actionsByTeam = { away: [], home: [] };
  const subsByTeam = {
    away: { in: [], out: [], misc: [] },
    home: { in: [], out: [], misc: [] },
  };

  (descriptionArray || []).forEach((action) => {
    const teamKey =
      action.side === 'away' || action.side === 'home'
        ? action.side
        : action.teamTricode === awayTeamAbr
          ? 'away'
          : 'home';

    if (isSubstitutionAction(action)) {
      const parsed = parseSubstitutionNames(action.description);
      if (parsed?.inPlayer) subsByTeam[teamKey].in.push(parsed.inPlayer);
      if (parsed?.outPlayer) subsByTeam[teamKey].out.push(parsed.outPlayer);
      if (!parsed) {
        subsByTeam[teamKey].misc.push(action.description);
      }
      return;
    }

    actionsByTeam[teamKey].push(action);
  });

  return { actionsByTeam, subsByTeam };
}

export function buildSubSummary(subs) {
  const lines = [];
  const inPlayers = uniqueList(subs?.in);
  const outPlayers = uniqueList(subs?.out);

  if (inPlayers.length) {
    lines.push(`SUB in: ${inPlayers.join(', ')}`);
  }
  if (outPlayers.length) {
    lines.push(`SUB out: ${outPlayers.join(', ')}`);
  }

  return lines;
}

export function buildTooltipRenderItems({ actionsByTeam, subsByTeam, teamColors }) {
  const awayItems = [
    ...(actionsByTeam?.away || [])
      .slice()
      .sort(compareTeamActions)
      .map((action) => ({
        action,
        teamColor: teamColors?.away,
        isSubSummary: false,
      })),
    ...buildSubSummary(subsByTeam?.away).map((description) => ({
      action: { description },
      teamColor: teamColors?.away,
      isSubSummary: true,
    })),
  ];

  const homeItems = [
    ...(actionsByTeam?.home || [])
      .slice()
      .sort(compareTeamActions)
      .map((action) => ({
        action,
        teamColor: teamColors?.home,
        isSubSummary: false,
      })),
    ...buildSubSummary(subsByTeam?.home).map((description) => ({
      action: { description },
      teamColor: teamColors?.home,
      isSubSummary: true,
    })),
  ];

  return [...awayItems, ...homeItems];
}

export function pickPrimaryTooltipAction(descriptionArray, focusActionMeta) {
  if (!descriptionArray || descriptionArray.length === 0) return null;

  if (focusActionMeta && focusActionMeta.actionNumber != null) {
    const focusMatch = descriptionArray.find(
      (action) => String(action.actionNumber) === String(focusActionMeta.actionNumber),
    );
    if (focusMatch) return focusMatch;
  }

  const scored = descriptionArray.filter((action) => {
    const away = action?.scoreAway;
    const home = action?.scoreHome;
    return (
      (away !== undefined && away !== null && String(away).trim() !== '') ||
      (home !== undefined && home !== null && String(home).trim() !== '')
    );
  });

  if (scored.length) return pickLatestAction(scored);
  return descriptionArray[0];
}
