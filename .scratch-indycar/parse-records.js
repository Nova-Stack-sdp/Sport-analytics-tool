const fs = require('fs');

const files = {
  toronto2025: '1259281d.txt',
  longbeach2023: '06a6f0f8.txt',
  indy5002024: '0cce1850.txt',
  sonsioims2024: '9ddc6f94.txt',
  roadamerica2023: '5dce6539.txt',
};
const base = 'C:/Users/user/.qoder/cache/projects/sport-analytics-tool-9bc05f7d/agent-tools/11fbe974/';

const out = {};
for (const [key, f] of Object.entries(files)) {
  const j = JSON.parse(fs.readFileSync(base + f, 'utf8'));
  const recs = j.records || [];
  const byFinish = [...recs].sort((a, b) => (a.PositionFinish || 999) - (b.PositionFinish || 999));
  const winner = byFinish[0];
  const pole = recs.find((r) => Number(r.PositionStart) === 1);
  const active = recs.filter((r) => /running|active/i.test(r.Status || '')).length;
  const maxLaps = Math.max(...recs.map((r) => Number(r.LapsComplete) || 0));
  out[key] = {
    EventName: j.EventName,
    SessionDate: j.SessionDate,
    SessionName: j.SessionName,
    SessionType: j.SessionType,
    TrackType: j.TrackType,
    fieldSize: recs.length,
    classified: active,
    totalLaps: maxLaps,
    winner: winner
      ? {
          car: winner.CarNumber,
          driver: `${winner.FirstName} ${winner.LastName}`,
          team: winner.TeamName || winner.Team,
          started: winner.PositionStart,
          led: winner.LapsLed,
          margin: winner.Gap || winner.Difference,
          time: winner.ElapsedTime,
        }
      : null,
    pole: pole ? { car: pole.CarNumber, driver: `${pole.FirstName} ${pole.LastName}` } : null,
    recordFields: recs.length ? Object.keys(recs[0]) : [],
    podium: byFinish.slice(0, 3).map((r) => ({
      pos: r.PositionFinish,
      car: r.CarNumber,
      driver: `${r.FirstName} ${r.LastName}`,
      team: r.TeamName || r.Team,
      status: r.Status,
    })),
  };
}
console.log(JSON.stringify(out, null, 2));
