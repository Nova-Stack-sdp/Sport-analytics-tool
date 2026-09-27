const fs = require('fs');

const DATA = 'c:/Users/user/sport-analytics-tool/.scratch-indycar/data';
const API = 'C:/Users/user/.qoder/cache/projects/sport-analytics-tool-9bc05f7d/agent-tools/11fbe974/';

const RACES = [
  { key: 'toronto2025', api: '1259281d.txt', label: '2025 Honda Indy Toronto', video: 'UO4c-wMLhso', start: 184 },
  { key: 'longbeach2023', api: '06a6f0f8.txt', label: '2023 Acura GP of Long Beach', video: '2ifguXu0P7s', start: 1704 },
  { key: 'indy5002024', api: '0cce1850.txt', label: '2024 Indianapolis 500', video: 'fWwonhySrWg', start: 10353 },
  { key: 'sonsioims2024', api: '9ddc6f94.txt', label: '2024 Sonsio GP (IMS road)', video: '6Xc1jSd3sgo', start: 2160 },
  { key: 'roadamerica2023', api: '5dce6539.txt', label: '2023 Sonsio GP at Road America', video: 'uEm9j8vVoAk', start: 1030 },
];

function hmsToSec(s) {
  const p = s.split(':').map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0];
}
function fmt(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function carKey(c) { return String(c).padStart(2, '0'); }

(async () => {
  const durations = {};
  for (const r of RACES) {
    try {
      const res = await fetch(`https://www.youtube.com/watch?v=${r.video}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      const html = await res.text();
      const m = html.match(/"lengthSeconds":"(\d+)"/);
      durations[r.video] = m ? Number(m[1]) : null;
    } catch (e) {
      durations[r.video] = null;
    }
  }
  console.log('video durations (s):', JSON.stringify(durations));

  const out = {};
  for (const r of RACES) {
    const j = JSON.parse(fs.readFileSync(`${DATA}/${r.key}.json`, 'utf8'));
    const api = JSON.parse(fs.readFileSync(API + r.api, 'utf8'));
    const laps = j.leaderLaps;
    const totalLaps = laps.length;
    const byFinish = [...api.records].sort((a, b) => (a.PositionFinish || 999) - (b.PositionFinish || 999));
    const winner = byFinish[0];
    const winnerElapsed = hmsToSec(winner.ElapsedTime);

    // raw cumulative clock with lead-change diff corrections (lower-bound model)
    const cum = {};
    let t = 0;
    const transitions = [{ lap: 0, at: 0 }];
    for (let i = 0; i < laps.length; i++) {
      const l = laps[i];
      if (i > 0 && carKey(laps[i - 1].car) !== carKey(l.car)) {
        t += hmsToSec(laps[i - 1].diff);
        transitions.push({ lap: l.lap, at: t });
      }
      t += hmsToSec(l.lapTime);
      cum[l.lap] = t;
    }
    const rawTotal = cum[totalLaps];
    const driftTotal = winnerElapsed - rawTotal;
    // calibrated clock: distribute residual drift proportionally over race time
    const T = (lap) => cum[lap] + driftTotal * (cum[lap] / rawTotal);
    const Tmid = (lap) => cum[lap] + (driftTotal / 2) * (cum[lap] / rawTotal); // uncertainty midpoint estimate

    // validate against pit anchors from top-6 qualifiers (small track-position offsets)
    const topCars = new Set(byFinish.slice(0, 6).map((x) => carKey(x.CarNumber)));
    let okStretch = 0, okRaw = 0, n = 0;
    for (const d of j.pitStops || []) {
      if (!topCars.has(carKey(d.car))) continue;
      for (const s of d.stops) {
        const pitT = hmsToSec(s.timeOfRace);
        const loRaw = (cum[Math.max(1, s.lap - 1)] || 0) - 5;
        const hiRaw = (cum[Math.min(totalLaps, s.lap)] || rawTotal) + 5;
        const loS = (T(Math.max(1, s.lap - 1)) || 0) - 5;
        const hiS = (T(Math.min(totalLaps, s.lap)) || winnerElapsed) + 5;
        n++;
        if (pitT >= loRaw && pitT <= hiRaw) okRaw++;
        if (pitT >= loS && pitT <= hiS) okStretch++;
      }
    }

    // cautions, reds, leaders from flags
    const cautions = [];
    let cur = null;
    laps.forEach((l, i) => {
      if (l.flag === 'Yellow' && !cur) cur = { from: l.lap };
      if (l.flag !== 'Yellow' && cur) { cur.to = i; cautions.push(cur); cur = null; }
    });
    if (cur) { cur.to = totalLaps; cautions.push(cur); }
    const leaders = [];
    let cl = null;
    for (const l of laps) {
      if (cl && carKey(cl.car) === carKey(l.car)) cl.to = l.lap;
      else { if (cl) leaders.push(cl); cl = { car: l.car, driver: l.driver, from: l.lap, to: l.lap }; }
    }
    if (cl) leaders.push(cl);

    const es = j.eventSummary;
    const podium = byFinish.slice(0, 3).map((x) => ({
      pos: x.PositionFinish, car: x.CarNumber, driver: `${x.FirstName} ${x.LastName}`,
      team: x.TeamName, started: x.PositionStart, lapsLed: x.LapsLed,
    }));
    const pole = api.records.find((x) => Number(x.PositionStart) === 1);
    const mostLapsLed = [...api.records].sort((a, b) => (b.LapsLed || 0) - (a.LapsLed || 0))[0];

    const vDur = durations[r.video];
    const ck = [
      { ev: 'Green flag (start of timing)', video: r.start, exact: true },
      { ev: `Lap 1 complete`, video: r.start + T(1) },
      { ev: `Lead change: ${leaders[1] ? leaders[1].driver + ' takes P1 (lap ' + leaders[1].from + ')' : 'n/a'}`, video: leaders[1] ? r.start + T(leaders[1].from) : null },
      { ev: `Half-distance (lap ${Math.floor(totalLaps / 2)})`, video: r.start + T(Math.floor(totalLaps / 2)) },
      ...cautions.map((c) => ({ ev: `Caution ${cautions.indexOf(c) + 1} starts (lap ${c.from})`, video: r.start + T(Math.max(1, c.from - 1)) })),
      { ev: 'Checkered flag (winner crosses)', video: r.start + winnerElapsed, exact: true },
    ].filter((c) => c.video != null);

    out[r.key] = {
      label: r.label, videoId: r.video, videoDurationSec: vDur ?? undefined,
      embedStart: r.start,
      eventDate: api.SessionDate, totalLaps, fieldSize: api.records.length,
      winner, podium, pole: { car: pole.CarNumber, driver: `${pole.FirstName} ${pole.LastName}` },
      raceTime: winner.ElapsedTime, raceTimeSec: winnerElapsed,
      clockModel: {
        rawLeaderClockSec: Math.round(rawTotal * 100) / 100,
        driftSec: Math.round(driftTotal * 100) / 100,
        midRaceUncertaintySec: Math.round(Math.abs(driftTotal) * 25) / 100,
        pitAnchorCheckTop6: { n, okRaw, okStretch },
      },
      stats: {
        avgSpeedMph: es.avgSpeed, greenLaps: es.greenLaps, cautionLaps: es.cautionLaps,
        cautionCount: cautions.length,
        leadChangesOfficial: es.leadChanges, leadDriversOfficial: es.leadDrivers,
        leadStretchesDerived: leaders.length,
        distinctLeadersDerived: new Set(leaders.map((x) => carKey(x.car))).size,
        mostLapsLed: { car: mostLapsLed.CarNumber, driver: `${mostLapsLed.FirstName} ${mostLapsLed.LastName}`, laps: mostLapsLed.LapsLed },
        bestLap: es.bestLap, bestLeadLap: es.bestLeadLap, mostImproved: es.mostImproved, passes: es.passes,
        pitStopsRecorded: (j.pitStops || []).reduce((a, d) => a + d.stops.length, 0),
        pitDrivers: (j.pitStops || []).length,
        fastestPitStopAvailable: !!(j.pitStops || []).length,
      },
      leaders: leaders.map((x) => ({ car: x.car, driver: x.driver, from: x.from, to: x.to, laps: x.to - x.from + 1 })),
      cautions: cautions.map((c) => ({ from: c.from, to: c.to, laps: c.to - c.from + 1 })),
      checkpoints: ck.map((c) => ({ event: c.ev, videoSeconds: Math.round(c.video), videoHMS: fmt(c.video), exact: !!c.exact })),
      endVsVideo: vDur ? { videoEndMinusCheckered: vDur - (r.start + winnerElapsed) } : undefined,
    };
  }
  fs.writeFileSync(`${DATA}/final-report.json`, JSON.stringify(out, null, 1));
  for (const r of RACES) {
    const d = out[r.key];
    console.log('====', d.label);
    console.log('  video', d.videoId, 'dur', d.videoDurationSec ?? '?', 'embedStart', d.embedStart);
    console.log('  clock: raw', d.clockModel.rawLeaderClockClockSec ?? d.clockModel.rawLeaderClockSec, 'drift', d.clockModel.driftSec, 'midrace +/-', d.clockModel.midRaceUncertaintySec, 'pitCheck top6 raw/stretch', JSON.stringify(d.clockModel.pitAnchorCheckTop6));
    console.log('  endVsVideo:', JSON.stringify(d.endVsVideo));
    for (const c of d.checkpoints) console.log(`   ${c.exact ? '*' : ' '} ${c.event.padEnd(45)} video ${c.videoHMS}`);
  }
})();
