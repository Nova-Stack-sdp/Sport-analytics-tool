// What the centre map shows: the whole field, one team, one driver, or a
// comparison between a few of either. One file owns all three parts of that
// idea — the header menu's modes, the label its trigger reads back, and the
// filter the map applies — so they cannot drift apart.
export const VIEW_MODES = [
  { mode: 'all', label: 'Whole race', note: 'Every driver' },
  { mode: 'team', label: 'Choose team', note: 'One team' },
  { mode: 'driver', label: 'Choose driver', note: 'One driver' },
  { mode: 'drivers', label: 'Compare drivers', note: 'Pick two or more' },
  { mode: 'teams', label: 'Compare teams', note: 'Pick two or more' },
];

// The prompt the trigger carries before anything has been picked.
export const VIEW_MENU_PROMPT = 'Choose what to see';

// The comparison modes keep the menu open while rows are toggled; the
// single-pick modes close on the pick.
export const isMultiMode = (mode) => mode === 'drivers' || mode === 'teams';

export const modeLabel = (mode) =>
  VIEW_MODES.find((entry) => entry.mode === mode)?.label ?? null;

// "Max VERSTAPPEN" → "VERSTAPPEN". The synced names already carry the
// broadcast capitals, and a menu label has room for more than a marker's
// three letters.
const shortDriver = (name) => String(name ?? '').trim().split(/\s+/).pop() ?? '';

// The two kinds of thing a scope can name, tested in one place so the label,
// the filter and the map's own add/remove controls cannot disagree.
export const scopeMatchesTeams = (mode) => mode === 'team' || mode === 'teams';

// A scope that is actually narrowing the map. The whole-field mode and a list
// that was opened but left empty are both everything, and neither has anything
// to take off the map.
export const isScopeActive = (scope) =>
  Boolean(scope) && scope.mode !== 'all' && (scope.values?.length ?? 0) > 0;

// What the trigger reads: the scope, or null while nothing has been chosen
// (a mode opened but left empty is not a choice yet).
export function scopeLabel(scope) {
  if (!scope) return null;
  if (scope.mode === 'all') return 'Whole race';
  const values = scope.values ?? [];
  if (values.length === 0) return null;
  const names = scopeMatchesTeams(scope.mode) ? values : values.map(shortDriver);
  return names.join(' vs ');
}

// The map's single filter — the markers and the legend both read through it —
// so what the menu says and what the map draws can never disagree. A scope
// with nothing picked shows everyone, which keeps an abandoned mode from
// blanking the map.
export function entryInScope(scope, entry) {
  if (!isScopeActive(scope)) return true;
  const field = scopeMatchesTeams(scope.mode) ? entry?.teamName : entry?.driverName;
  return scope.values.includes(field);
}

// The map's own ＋ / − controls make the same edits the header menu makes —
// they live here, beside the filter they have to agree with.

// Adding to a single pick turns it into a comparison rather than replacing
// what is already on the map, so a second name is never a surprise.
export function addToScope(scope, key) {
  const values = scope?.values ?? [];
  if (values.includes(key)) return scope;
  const mode = scope.mode === 'driver' ? 'drivers' : scope.mode === 'team' ? 'teams' : scope.mode;
  return { mode, values: [...values, key] };
}

// Dropping the last name puts the whole field back on the map, which is the
// same state as the header's "Whole race" choice.
export function removeFromScope(scope, key) {
  const values = (scope?.values ?? []).filter((value) => value !== key);
  return values.length === 0 ? { mode: 'all', values: [] } : { mode: scope.mode, values };
}
