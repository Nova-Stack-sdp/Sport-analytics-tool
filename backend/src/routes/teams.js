import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const teamsRouter = Router();

const API_SPORTS_BASE = 'https://v1.formula-1.api-sports.io';
const OPENF1_BASE = 'https://api.openf1.org/v1';
const WIKI_API = 'https://commons.wikimedia.org/w/api.php';
const WIKI_HEADERS = {
  'User-Agent': 'SportAnalyticsTool/1.0 (student project; F1 analytics dashboard)',
};

const F1_COLORS = {
  'Red Bull Racing': '#3671C6',
  'Oracle Red Bull Racing': '#3671C6',
  McLaren: '#FF8000',
  'McLaren Racing': '#FF8000',
  Ferrari: '#E8002D',
  'Scuderia Ferrari': '#E8002D',
  Mercedes: '#27F4D2',
  'Mercedes-AMG PETRONAS Formula One Team': '#27F4D2',
  'Aston Martin': '#229971',
  'Aston Martin Aramco Cognizant Formula One Team': '#229971',
  Williams: '#0093CC',
  'Williams Racing': '#0093CC',
  Haas: '#B6BABD',
  'Haas F1 Team': '#B6BABD',
  'Racing Bulls': '#6692FF',
  'Visa Cash App RB F1 Team': '#6692FF',
  'Visa Cash App RB Formula One Team': '#6692FF',
  Alpine: '#FF87BC',
  'BWT Alpine F1 Team': '#FF87BC',
  'Kick Sauber': '#52E252',
  'Stake F1 Team Kick Sauber': '#52E252',
};

const TEAM_NAME_ALIASES = {
  redbullracing: 'redbull',
  oracleredbullracing: 'redbull',
  mclaren: 'mclaren',
  mclarenracing: 'mclaren',
  ferrari: 'ferrari',
  scuderiaferrari: 'ferrari',
  mercedes: 'mercedes',
  mercedesamgpetronasformulaoneteam: 'mercedes',
  astonmartin: 'astonmartin',
  astonmartinaramcocognizantformulaoneteam: 'astonmartin',
  williams: 'williams',
  williamsracing: 'williams',
  haas: 'haas',
  haasf1team: 'haas',
  racingbulls: 'racingbulls',
  visacashapprbf1team: 'racingbulls',
  visacashapprbformulaoneteam: 'racingbulls',
  alpine: 'alpine',
  bwtalpinef1team: 'alpine',
  kicksauber: 'sauber',
  stakef1teamkicksauber: 'sauber',
};

function teamColor(name) {
  return F1_COLORS[name] || '#CE0D14';
}

function teamKey(name) {
  const normalized = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return TEAM_NAME_ALIASES[normalized] || normalized;
}

function initials(name) {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function openF1TeamColor(color) {
  if (!color) return null;
  return color.startsWith('#') ? color : `#${color}`;
}

async function apiSports(path) {
  const key = process.env.API_SPORTS_KEY;
  if (!key) throw new Error('API_SPORTS_KEY is not configured');

  const res = await fetch(`${API_SPORTS_BASE}${path}`, {
    headers: {
      'x-rapidapi-key': key,
      'x-rapidapi-host': 'v1.formula-1.api-sports.io',
    },
  });
  if (!res.ok) throw new Error(`API-Sports ${path} -> ${res.status}`);

  const data = await res.json();
  return data.response || [];
}

async function apiSportsOrEmpty(path) {
  try {
    return await apiSports(path);
  } catch (err) {
    // API-Sports enriches visual/profile data only. Its availability must never
    // hide the OpenF1-backed constructors and standings.
    return [];
  }
}

async function openF1(path, params) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${OPENF1_BASE}/${path}?${query}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`OpenF1 ${path} -> ${res.status}`);
  return res.json();
}

async function getCurrentSeason() {
  const latestMeeting = await prisma.meeting.findFirst({ orderBy: { season: 'desc' } });
  return latestMeeting?.season ?? new Date().getFullYear();
}

function apiTeamForName(apiTeams, name) {
  return apiTeams.find((team) => teamKey(team.name) === teamKey(name)) || null;
}

function isResultSession(entry) {
  return entry.session.type === 'Race' || entry.session.type === 'Sprint';
}

async function fetchResultsBySession(entries) {
  const sessionKeys = [...new Set(
    entries
      .filter((entry) => isResultSession(entry) && entry.session.openf1Key)
      .map((entry) => entry.session.openf1Key),
  )];

  const records = await Promise.all(sessionKeys.map(async (sessionKey) => {
    try {
      const results = await openF1('session_result', { session_key: sessionKey });
      return [sessionKey, new Map(results.map((result) => [Number(result.driver_number), result]))];
    } catch (err) {
      // The local projection is a fallback when a historical OpenF1 response
      // is temporarily unavailable.
      return [sessionKey, new Map()];
    }
  }));

  return new Map(records);
}

async function fetchLatestTeamProfiles(entries) {
  const latestSession = entries
    .filter((entry) => entry.session.openf1Key)
    .sort((a, b) => new Date(b.session.startTime) - new Date(a.session.startTime))[0]?.session;
  if (!latestSession?.openf1Key) return new Map();

  try {
    const drivers = await openF1('drivers', { session_key: latestSession.openf1Key });
    return new Map(drivers.map((driver) => [teamKey(driver.team_name), driver]));
  } catch (err) {
    return new Map();
  }
}

function resultForEntry(entry, resultsBySession) {
  const remoteResult = entry.session.openf1Key
    ? resultsBySession.get(entry.session.openf1Key)?.get(entry.driver.driverNumber)
    : null;

  if (remoteResult) {
    return {
      position: remoteResult.position ?? null,
      points: Number(remoteResult.points) || 0,
      dnf: Boolean(remoteResult.dnf || remoteResult.dns || remoteResult.dsq),
    };
  }

  if (!entry.sessionStats) return null;
  return {
    position: entry.sessionStats.finalPosition ?? null,
    points: Number(entry.sessionStats.points) || 0,
    dnf: entry.sessionStats.finalPosition == null,
  };
}

function deriveTeamStats(entries, resultsBySession) {
  const results = entries
    .filter(isResultSession)
    .map((entry) => resultForEntry(entry, resultsBySession))
    .filter(Boolean);
  const classified = results.filter((result) => result.position != null);

  return {
    starts: results.length,
    points: results.reduce((sum, result) => sum + result.points, 0),
    wins: classified.filter((result) => result.position === 1).length,
    podiums: classified.filter((result) => result.position <= 3).length,
    reliabilityRate: results.length
      ? Number(((results.length - results.filter((result) => result.dnf).length) / results.length).toFixed(3))
      : null,
  };
}

async function fetchTeamGallery(chassis) {
  if (!chassis) return [];

  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `${chassis} Formula 1`,
    gsrlimit: '8',
    gsrnamespace: '6',
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: '1200',
    format: 'json',
    origin: '*',
  });
  const res = await fetch(`${WIKI_API}?${params.toString()}`, { headers: WIKI_HEADERS });
  if (!res.ok) return [];

  const data = await res.json();
  return Object.values(data.query?.pages ?? {})
    .filter((page) => /\.(jpe?g|png)$/i.test(page.title || ''))
    .slice(0, 4)
    .map((page, index) => ({
      rank: index + 1,
      url: page.imageinfo?.[0]?.thumburl ?? page.imageinfo?.[0]?.url ?? null,
      source: 'Wikimedia Commons',
    }))
    .filter((shot) => shot.url);
}

function serializeTeam(team, stats, apiTeam, openF1Profile) {
  return {
    id: team.id,
    apiId: apiTeam ? String(apiTeam.id) : null,
    name: team.name,
    color: openF1TeamColor(openF1Profile?.team_colour) || teamColor(team.name),
    logoUrl: apiTeam?.logo || null,
    initials: initials(team.name),
    points: stats.points,
    wins: stats.wins,
  };
}

teamsRouter.get('/', async (req, res, next) => {
  try {
    const season = await getCurrentSeason();
    const teams = await prisma.team.findMany({
      where: {
        season,
        entries: { some: { session: { meeting: { season } } } },
      },
      include: {
        entries: {
          where: { session: { meeting: { season } } },
          include: {
            driver: true,
            sessionStats: true,
            session: { include: { meeting: true } },
          },
        },
      },
    });

    const allEntries = teams.flatMap((team) => team.entries);
    const [apiTeams, resultsBySession, profilesByTeam] = await Promise.all([
      apiSportsOrEmpty('/teams'),
      fetchResultsBySession(allEntries),
      fetchLatestTeamProfiles(allEntries),
    ]);

    const enriched = teams
      .map((team) => {
        const stats = deriveTeamStats(team.entries, resultsBySession);
        return serializeTeam(team, stats, apiTeamForName(apiTeams, team.name), profilesByTeam.get(teamKey(team.name)));
      })
      .sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name));

    res.json({ season, teams: enriched });
  } catch (err) {
    next(err);
  }
});

teamsRouter.get('/:id', async (req, res, next) => {
  try {
    const season = await getCurrentSeason();
    const team = await prisma.team.findUnique({
      where: { id: req.params.id },
      include: {
        entries: {
          where: { session: { meeting: { season } } },
          include: {
            driver: true,
            sessionStats: true,
            session: { include: { meeting: true } },
          },
        },
      },
    });
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const [apiTeams, resultsBySession, profilesByTeam] = await Promise.all([
      apiSportsOrEmpty('/teams'),
      fetchResultsBySession(team.entries),
      fetchLatestTeamProfiles(team.entries),
    ]);
    const apiTeam = apiTeamForName(apiTeams, team.name);
    const stats = deriveTeamStats(team.entries, resultsBySession);
    const drivers = Array.from(new Map(
      team.entries.map((entry) => [entry.driver.id, {
        id: entry.driver.id,
        name: entry.driver.name,
        number: entry.driver.driverNumber,
      }]),
    ).values());
    const driversWithImages = await Promise.all(drivers.map(async (driver) => {
      const [apiDriver] = await apiSportsOrEmpty(`/drivers?number=${driver.number}`);
      return { ...driver, imageUrl: apiDriver?.image || null };
    }));
    const gallery = await fetchTeamGallery(apiTeam?.chassis).catch(() => []);

    res.json({
      ...serializeTeam(team, stats, apiTeam, profilesByTeam.get(teamKey(team.name))),
      base: apiTeam?.base || null,
      firstTeamEntry: apiTeam?.first_team_entry || null,
      worldChampionships: apiTeam?.world_championships ?? null,
      highestRaceFinish: apiTeam?.highest_race_finish || null,
      polePositions: apiTeam?.pole_positions ?? null,
      fastestLaps: apiTeam?.fastest_laps ?? null,
      president: apiTeam?.president || null,
      director: apiTeam?.director || null,
      technicalManager: apiTeam?.technical_manager || null,
      chassis: apiTeam?.chassis || null,
      engine: apiTeam?.engine || null,
      tyres: apiTeam?.tyres || null,
      season,
      seasonStats: stats,
      drivers: driversWithImages,
      gallery,
    });
  } catch (err) {
    next(err);
  }
});
