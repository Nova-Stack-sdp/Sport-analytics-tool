import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const teamsRouter = Router();

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

function initials(name) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

teamsRouter.get('/', async (req, res, next) => {
  try {
    const season = await getCurrentSeason();
    const [apiTeams, seasonStats] = await Promise.all([
      apiSports('/teams'),
      prisma.teamSeasonStats.findMany({
        where: { season },
        include: { team: true },
        orderBy: { points: 'desc' },
      }),
    ]);

    const statsByName = new Map();
    for (const s of seasonStats) {
      statsByName.set(s.team.name, { points: s.points, wins: s.wins });
    }

    const enriched = apiTeams
      .map((t) => {
        const stats = statsByName.get(t.name) || { points: 0, wins: 0 };
        return {
          id: String(t.id),
          name: t.name,
          color: teamColor(t.name),
          logoUrl: t.logo,
          initials: initials(t.name),
          points: stats.points,
          wins: stats.wins,
        };
      })
      .sort((a, b) => b.points - a.points);

    res.json({ season, teams: enriched });
  } catch (err) {
    next(err);
  }
});

teamsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const season = await getCurrentSeason();

    const [teamDetail] = await apiSports(`/teams?id=${id}`);
    if (!teamDetail) return res.status(404).json({ error: 'Team not found' });

    const stats = await prisma.teamSeasonStats.findFirst({
      where: { team: { name: teamDetail.name }, season },
      include: { team: { include: { entries: { include: { session: { include: { meeting: true } }, driver: true } } } } },
    });

    const drivers = new Map();
    if (stats?.team?.entries) {
      for (const entry of stats.team.entries) {
        if (entry.session.meeting.season === season) {
          drivers.set(entry.driver.id, {
            id: entry.driver.id,
            name: entry.driver.name,
            number: entry.driver.driverNumber,
          });
        }
      }
    }

    res.json({
      id: String(teamDetail.id),
      name: teamDetail.name,
      color: teamColor(teamDetail.name),
      logoUrl: teamDetail.logo,
      base: teamDetail.base,
      firstTeamEntry: teamDetail.first_team_entry,
      worldChampionships: teamDetail.world_championships,
      highestRaceFinish: teamDetail.highest_race_finish,
      polePositions: teamDetail.pole_positions,
      fastestLaps: teamDetail.fastest_laps,
      president: teamDetail.president,
      director: teamDetail.director,
      technicalManager: teamDetail.technical_manager,
      chassis: teamDetail.chassis,
      engine: teamDetail.engine,
      tyres: teamDetail.tyres,
      season,
      seasonStats: stats
        ? { points: stats.points, wins: stats.wins, reliabilityRate: stats.reliabilityRate }
        : null,
      drivers: Array.from(drivers.values()),
    });
  } catch (err) {
    next(err);
  }
});
