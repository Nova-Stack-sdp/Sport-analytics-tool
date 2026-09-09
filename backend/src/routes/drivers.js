import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const driversRouter = Router();

const API_SPORTS_BASE = 'https://v1.formula-1.api-sports.io';
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
  'Visa Cash App RB Formula One Team': '#6692FF',
  Alpine: '#FF87BC',
  'BWT Alpine F1 Team': '#FF87BC',
  'Kick Sauber': '#52E252',
  'Stake F1 Team Kick Sauber': '#52E252',
};

function teamColor(name) {
  return F1_COLORS[name] || '#CE0D14';
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

const OPENF1_BASE = 'https://api.openf1.org/v1';

async function openF1(path, params) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${OPENF1_BASE}/${path}?${query}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`OpenF1 ${path} -> ${res.status}`);
  return res.json();
}

function resultForEntry(entry, result, grid) {
  const position = result?.position ?? entry.sessionStats?.finalPosition ?? null;
  const points = result?.points ?? entry.sessionStats?.points ?? 0;
  const dnf = result
    ? Boolean(result.dnf || result.dns || result.dsq)
    : Boolean(entry.sessionStats && entry.sessionStats.finalPosition == null);

  return {
    sessionId: entry.session.id,
    meetingName: entry.session.meeting.name,
    type: entry.session.type,
    startedAt: entry.session.startTime,
    qualified: grid?.position ?? null,
    result: position,
    dnf,
    fastestLap: false,
    points,
    laps: result?.number_of_laps ?? null,
    gapToLeader: result?.gap_to_leader ?? null,
    duration: result?.duration ?? null,
    status: result?.dsq ? 'DSQ' : result?.dns ? 'DNS' : result?.dnf ? 'DNF' : result ? 'Finished' : entry.sessionStats ? 'Finished' : 'Unknown',
    source: result ? 'openf1' : 'local',
  };
}

function summariseResults(results) {
  const classified = results.filter((result) => result.result != null);
  const bestFinish = classified.length ? Math.min(...classified.map((result) => result.result)) : null;
  const gridPositions = results
    .map((result) => result.qualified)
    .filter((position) => position != null);

  return {
    starts: results.length,
    points: results.reduce((sum, result) => sum + (Number(result.points) || 0), 0),
    wins: classified.filter((result) => result.result === 1).length,
    podiums: classified.filter((result) => result.result <= 3).length,
    dnfCount: results.filter((result) => result.dnf).length,
    poles: gridPositions.filter((position) => position === 1).length,
    highestGridPosition: gridPositions.length ? Math.min(...gridPositions) : null,
    highestRaceFinish: bestFinish ? { position: bestFinish, number: classified.filter((result) => result.result === bestFinish).length } : null,
    averageFinish: classified.length
      ? Number((classified.reduce((sum, result) => sum + result.result, 0) / classified.length).toFixed(1))
      : null,
  };
}

function openF1TeamColor(color) {
  if (!color) return null;
  return color.startsWith('#') ? color : `#${color}`;
}

async function getCurrentSeason() {
  const latestMeeting = await prisma.meeting.findFirst({ orderBy: { season: 'desc' } });
  return latestMeeting?.season ?? new Date().getFullYear();
}

function flagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '🏁';
  return countryCode
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

function parsePagination(query) {
  const offset = Math.max(0, Number.parseInt(query.offset, 10) || 0);
  const parsedLimit = Number.parseInt(query.limit, 10);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, 500)
    : 100;
  return { offset, limit };
}

driversRouter.get('/', async (req, res, next) => {
  try {
    const season = await getCurrentSeason();
    let careerStats = await prisma.driverCareerStats.findMany({
      where: { season },
      include: { driver: { include: { entries: { include: { team: true, session: { include: { meeting: true } } } } } } },
      orderBy: { points: 'desc' },
    });

    // A season synced before derivation ran (or a session whose results
    // OpenF1 hadn't published yet) leaves driver_career_stats empty even
    // though drivers and entries exist. Fall back to the entry list so the
    // page still shows every driver, with zeroed stats, instead of nothing.
    if (careerStats.length === 0) {
      const entries = await prisma.entry.findMany({
        where: { session: { meeting: { season } } },
        include: { driver: true, session: { include: { meeting: true } } },
      });
      const seen = new Map();
      for (const e of entries) {
        if (!seen.has(e.driverId)) {
          seen.set(e.driverId, {
            driverId: e.driverId,
            driver: e.driver,
            points: 0,
            wins: 0,
            podiums: 0,
          });
        }
      }
      careerStats = Array.from(seen.values());
    }

    // Enrichment sources are fetched once per request instead of once per
    // driver: one API-Sports batch call matched by car number, and one OpenF1
    // call for the latest synced session (fresh headshots and team colours).
    let apiDrivers = [];
    try {
      apiDrivers = await apiSports('/drivers');
    } catch (err) {
      // API-Sports enriches visual data only; a failure must not hide the standings.
    }
    const apiByNumber = new Map(
      apiDrivers.filter((d) => Number.isFinite(d?.number)).map((d) => [d.number, d])
    );

    const latestOpenF1Entry = careerStats
      .flatMap((cs) => cs.driver?.entries ?? [])
      .filter((e) => e.session?.openf1Key != null && e.session?.startTime)
      .sort((a, b) => new Date(b.session.startTime) - new Date(a.session.startTime))[0];
    let openF1ByNumber = new Map();
    if (latestOpenF1Entry) {
      try {
        const profiles = await openF1('drivers', { session_key: latestOpenF1Entry.session.openf1Key });
        openF1ByNumber = new Map(
          profiles.filter((p) => Number.isFinite(p?.driver_number)).map((p) => [p.driver_number, p])
        );
      } catch (err) {
        // OpenF1 headshots are best-effort; API-Sports/local data still renders.
      }
    }

    const enriched = careerStats.map((cs) => {
      const driver = cs.driver;
      const profile = driver ? openF1ByNumber.get(driver.driverNumber) ?? null : null;
      const apiDriver = driver ? apiByNumber.get(driver.driverNumber) ?? null : null;
      const team = (driver?.entries ?? [])
        .filter((e) => e.session?.meeting?.season === season)
        .slice(-1)[0]?.team;
      const apiTeamName = apiDriver?.teams?.[0]?.team?.name || null;
      return {
        id: driver?.id ?? cs.driverId,
        apiId: apiDriver ? String(apiDriver.id) : null,
        name: profile?.full_name || driver?.name || null,
        number: driver?.driverNumber ?? null,
        points: cs.points,
        wins: cs.wins,
        podiums: cs.podiums,
        teamName: team?.name || apiTeamName || profile?.team_name || 'Unknown',
        teamColor: openF1TeamColor(profile?.team_colour) || teamColor(apiTeamName || team?.name || ''),
        nationality: apiDriver?.nationality || 'Unknown',
        countryCode: apiDriver?.country?.code || profile?.country_code || null,
        flag: flagEmoji(apiDriver?.country?.code || profile?.country_code || ''),
        imageUrl: profile?.headshot_url || apiDriver?.image || null,
        fallbackImageUrl: apiDriver?.image || null,
      };
    });

    const { offset, limit } = parsePagination(req.query);
    const page = enriched.slice(offset, offset + limit);
    res.json({
      season,
      drivers: page,
      total: enriched.length,
      offset,
      limit,
      hasMore: offset + page.length < enriched.length,
    });
  } catch (err) {
    next(err);
  }
});

driversRouter.get('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const season = await getCurrentSeason();

    const driver = await prisma.driver.findUnique({
      where: { id },
      include: {
        careerStats: { where: { season } },
        entries: { include: { team: true, sessionStats: true, session: { include: { meeting: true } } } },
      },
    });
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    const trackedEntries = driver.entries
      .filter((entry) => entry.session.type === 'Race' || entry.session.type === 'Sprint')
      .sort((a, b) => new Date(b.session.startTime) - new Date(a.session.startTime));
    const latestEntry = trackedEntries.find((entry) => entry.session.openf1Key)
      || [...driver.entries].sort((a, b) => new Date(b.session.startTime) - new Date(a.session.startTime))
        .find((entry) => entry.session.openf1Key);

    const [openF1Profile, apiDriver] = await Promise.all([
      latestEntry
        ? openF1('drivers', { session_key: latestEntry.session.openf1Key, driver_number: driver.driverNumber })
          .then(([profile]) => profile || null)
          .catch(() => null)
        : Promise.resolve(null),
      apiSports(`/drivers?number=${driver.driverNumber}`)
        .then(([profile]) => profile || null)
        .catch(() => null),
    ]);

    const results = await Promise.all(trackedEntries.map(async (entry) => {
      if (!entry.session.openf1Key) return resultForEntry(entry, null, null);

      try {
        const [sessionResults, startingGrid] = await Promise.all([
          openF1('session_result', { session_key: entry.session.openf1Key, driver_number: driver.driverNumber }),
          entry.session.meeting.openf1Key
            ? openF1('starting_grid', { meeting_key: entry.session.meeting.openf1Key, driver_number: driver.driverNumber })
            : Promise.resolve([]),
        ]);
        return resultForEntry(entry, sessionResults[0], startingGrid[0]);
      } catch (err) {
        // Preserve locally tracked data if OpenF1 is temporarily unavailable.
        return resultForEntry(entry, null, null);
      }
    }));

    const seasonResults = results.filter((result) => {
      const entry = trackedEntries.find((trackedEntry) => trackedEntry.session.id === result.sessionId);
      return entry?.session.meeting.season === season;
    });
    const derivedSeasonStats = summariseResults(seasonResults);
    const localSeasonStats = driver.careerStats[0];
    const seasonStats = seasonResults.length
      ? derivedSeasonStats
      : {
          ...derivedSeasonStats,
          points: localSeasonStats?.points ?? 0,
          wins: localSeasonStats?.wins ?? 0,
          podiums: localSeasonStats?.podiums ?? 0,
          dnfCount: localSeasonStats?.dnfCount ?? 0,
        };
    const trackedHistoryStats = summariseResults(results);
    const currentTeam = trackedEntries.find((entry) => entry.session.meeting.season === season)?.team
      || driver.entries
        .filter((entry) => entry.session.meeting.season === season)
        .sort((a, b) => new Date(b.session.startTime) - new Date(a.session.startTime))[0]?.team;
    const countryCode = openF1Profile?.country_code || apiDriver?.country?.code || null;
    const resolvedTeamName = openF1Profile?.team_name || currentTeam?.name || apiDriver?.teams?.[0]?.team?.name || 'Unknown';

    res.json({
      id: driver.id,
      apiId: apiDriver ? String(apiDriver.id) : null,
      name: openF1Profile?.full_name || driver.name,
      number: driver.driverNumber,
      broadcastName: openF1Profile?.broadcast_name || null,
      acronym: openF1Profile?.name_acronym || null,
      firstName: openF1Profile?.first_name || null,
      lastName: openF1Profile?.last_name || null,
      nationality: apiDriver?.nationality || countryCode || 'Unknown',
      countryCode,
      flag: flagEmoji(countryCode || ''),
      birthdate: apiDriver?.birthdate || null,
      birthplace: apiDriver?.birthplace || null,
      imageUrl: openF1Profile?.headshot_url || apiDriver?.image || null,
      teamName: resolvedTeamName,
      teamColor: openF1TeamColor(openF1Profile?.team_colour) || teamColor(resolvedTeamName),
      grandsPrixEntered: apiDriver?.grands_prix_entered || trackedHistoryStats.starts,
      worldChampionships: apiDriver?.world_championships || 0,
      careerPoints: apiDriver?.career_points || null,
      season,
      seasonStats,
      trackedHistoryStats,
      results,
    });
  } catch (err) {
    next(err);
  }
});
