const fs = require('fs');

const file = process.argv[2];
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));

const targets = [
  { year: 2025, match: /toronto/i },
  { year: 2023, match: /long beach/i },
  { year: 2024, match: /indianapolis 500/i },
  { year: 2024, match: /^sonsio/i },
  { year: 2023, match: /road america/i },
];

const out = [];
for (const t of targets) {
  const season = Array.isArray(raw) ? raw.find((s) => Number(s.Year) === t.year) : null;
  if (!season) {
    out.push({ year: t.year, error: 'season not found' });
    continue;
  }
  for (const ev of season.Events || []) {
    if (t.match.test(ev.EventName)) {
      const raceSessions = (ev.Sessions || []).filter((s) => /race/i.test(s.SessionName));
      out.push({
        year: t.year,
        EventID: ev.EventID,
        EventName: ev.EventName,
        raceSessions: raceSessions.map((s) => ({ id: s.EventsSessionID, name: s.SessionName })),
        allSessionNames: (ev.Sessions || []).map((s) => s.SessionName),
      });
    }
  }
}
console.log(JSON.stringify(out, null, 2));
