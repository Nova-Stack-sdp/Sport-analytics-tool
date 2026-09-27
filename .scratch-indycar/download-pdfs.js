const fs = require('fs');
const path = require('path');

const races = [
  { key: 'toronto2025', sid: 6467, date: '2025-07-20' },
  { key: 'longbeach2023', sid: 6138, date: '2023-04-16' },
  { key: 'indy5002024', sid: 6309, date: '2024-05-26' },
  { key: 'sonsioims2024', sid: 6301, date: '2024-05-11' },
  { key: 'roadamerica2023', sid: 6140, date: '2023-06-18' },
];
const docs = [
  'indycar-eventsummary.pdf',
  'indycar-race-leaderlapsummary.pdf',
  'indycar-race-pitstopsummary.pdf',
  'indycar-race-lapchart.pdf',
  'indycar-race-results.pdf',
  'indycar-race-boxscore.pdf',
  'indycar-boxscore-race.pdf',
];

const outRoot = path.join(__dirname, 'pdfs');
fs.mkdirSync(outRoot, { recursive: true });

(async () => {
  for (const r of races) {
    fs.mkdirSync(path.join(outRoot, r.key), { recursive: true });
    for (const doc of docs) {
      const url = `http://www.imscdn.com/INDYCAR/Documents/${r.sid}/${r.date}/${doc}`;
      const dest = path.join(outRoot, r.key, doc);
      try {
        const res = await fetch(url, { redirect: 'follow' });
        if (!res.ok) {
          console.log(`MISS ${res.status} ${r.key}/${doc}`);
          continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(dest, buf);
        console.log(`OK ${buf.length} ${r.key}/${doc}`);
      } catch (e) {
        console.log(`ERR ${r.key}/${doc}: ${e.message}`);
      }
    }
  }
})();
