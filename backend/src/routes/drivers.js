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

driversRouter.get('/', async (req, res, next) => {
  try {
    const season = await getCurrentSeason();
    let careerStats = await prisma.driverCareerStats.findMany({
      where: { season },
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
    } else {
      const loaded = await prisma.driverCareerStats.findMany({
        where: { season },
        include: { driver: { include: { entries: { include: { team: true, session: { include: { meeting: true } } } } } } },
        orderBy: { points: 'desc' },
      });
      careerStats = loaded;
    }

    const enriched = [];
    for (const cs of careerStats) {
      const driverWithEntries = cs.driver?.entries
        ? cs.driver
        : await prisma.driver.findUnique({
            where: { id: cs.driverId },
            include: { entries: { include: { team: true, session: { include: { meeting: true } } } } },
          });
      const team = (driverWithEntries?.entries ?? [])
        .filter((e) => e.session.meeting.season === season)
        .slice(-1)[0]?.team;

      let apiDriver = null;
      try {
        [apiDriver] = await apiSports(`/drivers?number=${driverWithEntries.driverNumber}`);
      } catch (err) {
        // API-Sports can be flaky per call; don't let one driver break the list.
      }

      enriched.push({
        id: driverWithEntries.id,
        apiId: apiDriver ? String(apiDriver.id) : null,
        name: driverWithEntries.name,
        number: driverWithEntries.driverNumber,
        points: cs.points,
        wins: cs.wins,
        podiums: cs.podiums,
        teamName: team?.name ?? (apiDriver?.teams?.[0]?.team?.name || 'Unknown'),
        teamColor: teamColor(apiDriver?.teams?.[0]?.team?.name || team?.name || ''),
        nationality: apiDriver?.nationality || 'Unknown',
        countryCode: apiDriver?.country?.code || null,
        flag: flagEmoji(apiDriver?.country?.code || ''),
        imageUrl: apiDriver?.image || null,
      });
    }

    res.json({ season, drivers: enriched });
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
