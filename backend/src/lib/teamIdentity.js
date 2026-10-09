/**
 * Team colour and short code for the statistics tables.
 *
 * Team names differ between seasons and sources ("Red Bull Racing",
 * "Oracle Red Bull Racing", "Visa Cash App RB F1 Team"…), so names are
 * reduced to a stable key first. Colours match the ones the Teams pages
 * use (routes/teams.js F1_COLORS). A team without a known colour gets a
 * neutral grey rather than a made-up one.
 */
const TEAM_NAME_ALIASES = {
  redbullracing: 'redbull',
  oracleredbullracing: 'redbull',
  mclarenracing: 'mclaren',
  mclarenmastercardf1team: 'mclaren',
  scuderiaferrari: 'ferrari',
  scuderiaferrarihp: 'ferrari',
  mercedesamgpetronas: 'mercedes',
  mercedesamgpetronasformulaoneteam: 'mercedes',
  astonmartinf1team: 'astonmartin',
  astonmartinaramcoformulaoneteam: 'astonmartin',
  astonmartinaramcocognizantformulaoneteam: 'astonmartin',
  williamsf1team: 'williams',
  williamsracing: 'williams',
  atlassianwilliamsf1team: 'williams',
  haasf1team: 'haas',
  tgrhaasf1team: 'haas',
  moneygramhaasf1team: 'haas',
  rb: 'racingbulls',
  visacashapprb: 'racingbulls',
  visacashapprbf1team: 'racingbulls',
  visacashapprbformulaoneteam: 'racingbulls',
  visacashappracingbullsformulaoneteam: 'racingbulls',
  alphatauri: 'racingbulls',
  scuderiaalphatauri: 'racingbulls',
  alpinef1team: 'alpine',
  bwtalpinef1team: 'alpine',
  bwtalpineformulaoneteam: 'alpine',
  audif1team: 'audi',
  audirevolutf1team: 'audi',
  cadillacf1team: 'cadillac',
  cadillacformula1team: 'cadillac',
  kicksauber: 'sauber',
  stakef1teamkicksauber: 'sauber',
  alfaromeo: 'sauber',
};

const TEAMS = {
  redbull: { color: '#3671C6', code: 'RBR' },
  mclaren: { color: '#FF8000', code: 'MCL' },
  ferrari: { color: '#E8002D', code: 'FER' },
  mercedes: { color: '#27F4D2', code: 'MER' },
  astonmartin: { color: '#229971', code: 'AMR' },
  williams: { color: '#0093CC', code: 'WIL' },
  haas: { color: '#B6BABD', code: 'HAA' },
  racingbulls: { color: '#6692FF', code: 'RB' },
  alpine: { color: '#FF87BC', code: 'ALP' },
  sauber: { color: '#52E252', code: 'SAU' },
  audi: { color: null, code: 'AUD' },
  cadillac: { color: null, code: 'CAD' },
};

export const NEUTRAL_TEAM_COLOR = '#8A8F98';

export function teamKey(name) {
  const normalized = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return TEAM_NAME_ALIASES[normalized] || normalized;
}

/** { color, code } for a team name; unknown teams get grey and their initials. */
export function teamIdentity(name) {
  if (!name) return { color: NEUTRAL_TEAM_COLOR, code: null };
  const known = TEAMS[teamKey(name)];
  const initials = String(name).split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  return {
    color: known?.color ?? NEUTRAL_TEAM_COLOR,
    code: known?.code ?? initials,
  };
}
