// How a driver is named on this page, in one place: the map markers, the
// roster beside them and every panel under it all read a name through these
// two functions, so "Max VERSTAPPEN" can never be spelled VER on the map and
// VERSTAPPEN in a table. They started as the stage's own private helpers and
// moved here when the panels became a second reader of the same names.

// OpenF1 stores names like "Max VERSTAPPEN"; live timing shows VER.
export function driverCode(name) {
  const last = String(name ?? '').trim().split(/\s+/).pop() ?? '';
  const letters = last
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '');
  return letters.slice(0, 3).toUpperCase() || '—';
}

// "Max VERSTAPPEN" → "Max Verstappen" for the legend; names already in
// normal case pass through untouched.
export function displayName(name) {
  return String(name ?? '')
    .trim()
    .split(/\s+/)
    .map((word) =>
      word.length > 2 && word === word.toUpperCase() ? word[0] + word.slice(1).toLowerCase() : word
    )
    .join(' ');
}
