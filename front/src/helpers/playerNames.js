const NAME_SUFFIX = /^(jr|sr|ii|iii|iv|v)\.?$/i;
// A hyphenated last name longer than this becomes initials (Caldwell-Pope -> KCP).
const HYPHENATED_LAST_NAME_MAX = 9;

// The short label used for a player on narrow screens: the last name without
// Jr./III, or the familiar initials for a long hyphenated name (KCP, SGA, NAW).
export function shortPlayerName(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) return parts[0] || '';

  while (parts.length > 2 && NAME_SUFFIX.test(parts[parts.length - 1])) parts.pop();
  const lastName = parts.slice(1).join(' ');

  if (lastName.includes('-') && lastName.length > HYPHENATED_LAST_NAME_MAX) {
    return parts
      .join(' ')
      .split(/[\s-]+/)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }
  return lastName;
}

// Ways to label a player, shortest first. Teammates who would share a label move on
// to the next one: "J. Brown", then first names for two J. Williamses ("Jalen",
// "Jaylin"), then full names as a last resort.
const LABEL_STEPS = [
  (name) => shortPlayerName(name),
  (name) => `${name.charAt(0)}. ${shortPlayerName(name)}`,
  (name) => name.split(/\s+/)[0],
  (name) => name,
];

// Short labels for one team, keyed by full name.
export function shortPlayerNames(fullNames) {
  const labels = {};
  const used = new Set();
  let pending = [...new Set((fullNames || []).map((name) => String(name).trim()))].filter(Boolean);

  LABEL_STEPS.forEach((labelFor, step) => {
    const isLastStep = step === LABEL_STEPS.length - 1;
    const counts = new Map();
    pending.forEach((name) => {
      const label = labelFor(name);
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    pending = pending.filter((name) => {
      const label = labelFor(name);
      if (!isLastStep && (counts.get(label) > 1 || used.has(label))) return true;
      labels[name] = label;
      used.add(label);
      return false;
    });
  });
  return labels;
}
