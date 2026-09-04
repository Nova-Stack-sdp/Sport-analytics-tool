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
    // page still shows every driver — and where possible, fill in real
    // points from API-Sports' standings instead of leaving everyone at 0.
    if (careerStats.length === 0) {
      const [entries, standings] = await Promise.all([
        prisma.entry.findMany({
          where: { session: { meeting: { season } } },
          include: { driver: true, session: { include: { meeting: true } } },
        }),
        // Best-effort only: real points instead of hardcoded 0s when
        // API-Sports has this season's standings. If the call fails, or a
        // driver isn't in the response, we still fall through to 0 below —
        // this never blocks the list from rendering.
        apiSports(`/rankings/drivers?season=${season}`).catch(() => []),
      ]);
      const standingsByNumber = new Map(
        standings.map((row) => [row.driver?.number, row]),
      );
      const seen = new Map();
      for (const e of entries) {
        if (!seen.has(e.driverId)) {
          const standing = standingsByNumber.get(e.driver.driverNumber);
          seen.set(e.driverId, {
            driverId: e.driverId,
            driver: e.driver,
            points: standing?.points ?? 0,
            wins: 0,
            podiums: 0,
          });
        }
      }
      careerStats = Array.from(seen.values()).sort((a, b) => b.points - a.points);
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

    let apiDriver = null;
    try {
      [apiDriver] = await apiSports(`/drivers?number=${driver.driverNumber}`);
    } catch (err) {
      // fall through
    }

    const currentTeam = driver.entries
      .filter((e) => e.session.meeting.season === season)
      .slice(-1)[0]?.team;

    const currentSeasonStats = driver.careerStats[0] || { points: 0, wins: 0, podiums: 0, dnfCount: 0 };

    const results = driver.entries
      .filter((e) => e.session.meeting.season === season && e.sessionStats)
      .sort((a, b) => new Date(b.session.startTime) - new Date(a.session.startTime))
      .map((e) => ({
        sessionId: e.session.id,
        meetingName: e.session.meeting.name,
        type: e.session.type,
        qualified: e.sessionStats.finalPosition ?? null,
        result: e.sessionStats.finalPosition ?? null,
        dnf: e.sessionStats.finalPosition == null,
        fastestLap: false,
        points: e.sessionStats.points ?? 0,
      }));

    res.json({
      id: driver.id,
      apiId: apiDriver ? String(apiDriver.id) : null,
      name: driver.name,
      number: driver.driverNumber,
      nationality: apiDriver?.nationality || 'Unknown',
      countryCode: apiDriver?.country?.code || null,
      flag: flagEmoji(apiDriver?.country?.code || ''),
      birthdate: apiDriver?.birthdate || null,
      birthplace: apiDriver?.birthplace || null,
      imageUrl: apiDriver?.image || null,
      teamName: currentTeam?.name || (apiDriver?.teams?.[0]?.team?.name || 'Unknown'),
      teamColor: teamColor(currentTeam?.name || apiDriver?.teams?.[0]?.team?.name || ''),
      grandsPrixEntered: apiDriver?.grands_prix_entered || driver.entries.length,
      worldChampionships: apiDriver?.world_championships || 0,
      careerPoints: apiDriver?.career_points || '0',
      podiums: apiDriver?.podiums || currentSeasonStats.podiums,
      highestRaceFinish: apiDriver?.highest_race_finish || null,
      highestGridPosition: apiDriver?.highest_grid_position || null,
      season,
      seasonStats: currentSeasonStats,
      results,
    });
  } catch (err) {
    next(err);
  }
});
