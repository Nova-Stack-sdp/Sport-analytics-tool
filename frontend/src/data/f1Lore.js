// Static "lore" calendar — driver birthdays, legends, and iconic moments.
// This is NOT pulled from the backend: it's hand-curated reference data
// that lives in the frontend, the same way the follow list lives in
// localStorage rather than Postgres (there's no per-user table on the
// backend yet). month/day repeat every year; `year` is only set for a
// specific one-off anniversary note.
//
// Each entry is matched against what the signed-in user follows before it's
// ever shown — see matchesFollows() below. driverName is compared against
// followed drivers, teamName against followed teams. An entry with neither
// (there are none right now) would never show, by design: nothing appears
// on the calendar for someone the user doesn't follow.
export const LORE_EVENTS = [
  { month: 1, day: 3, type: 'birthday', driverName: 'Michael Schumacher', title: 'Michael Schumacher Birthday', note: 'Record-tying 7-time World Champion and Ferrari icon.' },
  { month: 1, day: 7, type: 'birthday', driverName: 'Lewis Hamilton', title: 'Lewis Hamilton Birthday', note: 'Most Grand Prix wins in history; 7-time World Champion.' },
  { month: 1, day: 26, type: 'birthday', driverName: 'Sergio Perez', title: 'Sergio Perez Birthday', note: 'The "Ministry of Defence" and master of street circuits.' },
  { month: 2, day: 7, type: 'birthday', driverName: 'Pierre Gasly', title: 'Pierre Gasly Birthday', note: 'Infamous for his emotional 2020 Monza victory.' },
  { month: 2, day: 15, type: 'birthday', driverName: 'George Russell', title: 'George Russell Birthday', note: 'Mercedes driver, famously nicknamed "Mr. Consistency."' },
  { month: 2, day: 22, type: 'birthday', driverName: 'Niki Lauda', title: 'Niki Lauda Birthday', note: 'Three-time champion renowned for his legendary 1976 comeback.' },
  { month: 2, day: 24, type: 'birthday', driverName: 'Alain Prost', title: 'Alain Prost Birthday', note: 'Four-time champion nicknamed "The Professor" for his calculated style.' },
  { month: 3, day: 21, type: 'birthday', driverName: 'Ayrton Senna', title: 'Ayrton Senna Birthday', note: 'Triple World Champion; widely considered one of the fastest ever.' },
  { month: 3, day: 23, type: 'birthday', driverName: 'Alexander Albon', title: 'Alexander Albon Birthday', note: 'Williams Racing star and member of the exclusive "led a lap on my birthday" club.' },
  { month: 4, day: 6, type: 'birthday', driverName: 'Oscar Piastri', title: 'Oscar Piastri Birthday', note: "McLaren's younger sensation and podium finisher." },
  { month: 5, day: 8, type: 'birthday', driverName: 'Oliver Bearman', title: 'Oliver Bearman Birthday', note: 'British rising star on the active grid.' },
  { month: 5, day: 11, type: 'birthday', driverName: 'Yuki Tsunoda', title: 'Yuki Tsunoda Birthday', note: "Team VCARB's fan favorite, famous for fiery team radios." },
  { month: 6, day: 11, type: 'birthday', driverName: 'Jackie Stewart', title: 'Jackie Stewart Birthday', note: 'Legendary triple world champion and pioneer of modern motorsport safety.' },
  { month: 6, day: 27, type: 'birthday', driverName: 'Nico Rosberg', title: 'Nico Rosberg Birthday', note: 'The 2016 champion who famously beat Hamilton and immediately retired.' },
  { month: 7, day: 3, type: 'birthday', driverName: 'Sebastian Vettel', title: 'Sebastian Vettel Birthday', note: 'Four-time consecutive World Champion with Red Bull.' },
  { month: 7, day: 29, type: 'birthday', driverName: 'Fernando Alonso', title: 'Fernando Alonso Birthday', note: 'The oldest veteran on the grid, active since 2001.' },
  { month: 8, day: 8, type: 'birthday', driverName: 'Arvid Lindblad', title: 'Arvid Lindblad Birthday', note: 'The youngest rookie driver on the grid.' },
  { month: 8, day: 28, type: 'birthday', driverName: 'Valtteri Bottas', title: 'Valtteri Bottas Birthday', note: 'The ultimate wingman turned relaxed cycling enthusiast.' },
  { month: 9, day: 1, type: 'birthday', driverName: 'Carlos Sainz', title: 'Carlos Sainz Birthday', note: '"The Smooth Operator" who famously led the 2024 Italian GP on his 30th birthday.' },
  { month: 9, day: 17, type: 'birthday', driverName: 'Esteban Ocon', title: 'Esteban Ocon Birthday', note: "Highlighting Alpine's French Grand Prix winner." },
  { month: 9, day: 17, type: 'lore', teamName: 'Ferrari', title: '"Rawe Cekh" Anniversary', note: "Ferrari's iconic social media typo." },
  { month: 9, day: 30, type: 'birthday', driverName: 'Max Verstappen', title: 'Max Verstappen Birthday', note: 'The dominant Red Bull champion who rewrote the F1 record books.' },
  { month: 10, day: 16, type: 'birthday', driverName: 'Charles Leclerc', title: 'Charles Leclerc Birthday', note: 'Ferrari\u2019s beloved Mon\u00e9gasque "Il Predestinato."' },
  { month: 10, day: 29, type: 'birthday', driverName: 'Lance Stroll', title: 'Lance Stroll Birthday', note: 'Aston Martin driver and son of team owner Lawrence Stroll.' },
  { month: 11, day: 4, type: 'lore', driverName: 'Kimi Raikkonen', title: '"Leave Me Alone" Day', note: 'Commemorating Kimi R\u00e4ikk\u00f6nen\u2019s legendary 2012 Abu Dhabi radio rant.' },
  { month: 11, day: 13, type: 'birthday', driverName: 'Lando Norris', title: 'Lando Norris Birthday', note: "McLaren's leading contender and frontline champion." },
];

function normalize(value) {
  return (value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// True only if the entry's driver is in followedDrivers, or its team is in
// followedTeams (a loose "one name contains the other" match so "Ferrari"
// matches a stored team name like "Scuderia Ferrari").
export function matchesFollows(entry, followedDrivers, followedTeams) {
  if (entry.driverName) {
    const target = normalize(entry.driverName);
    return followedDrivers.some((driver) => normalize(driver.name) === target);
  }
  if (entry.teamName) {
    const target = normalize(entry.teamName);
    return followedTeams.some((team) => {
      const name = normalize(team.name);
      return name.includes(target) || target.includes(name);
    });
  }
  return false;
}

export function loreEventsForFollows(followedDrivers, followedTeams) {
  return LORE_EVENTS.filter((entry) => matchesFollows(entry, followedDrivers, followedTeams));
}