import sys, os, re, json
sys.path.insert(0, r'c:/Users/user/sport-analytics-tool/.scratch-indycar/pylibs')
import pdfplumber
from collections import defaultdict

BASE = r'c:/Users/user/sport-analytics-tool/.scratch-indycar/pdfs'
OUT = r'c:/Users/user/sport-analytics-tool/.scratch-indycar/data'
os.makedirs(OUT, exist_ok=True)

RACES = {
    'toronto2025': 'Ontario Honda Dealers Indy Toronto',
    'longbeach2023': 'Acura Grand Prix of Long Beach',
    'indy5002024': '108th Running of the Indianapolis 500',
    'sonsioims2024': 'Sonsio Grand Prix',
    'roadamerica2023': 'Sonsio Grand Prix at Road America',
}

LAP_LINE = re.compile(
    r'^(\d+)\s+(\d{1,2})\s+(.+?)\s+([A-Z]/[A-Z]{1,2}/[A-Z])\s+((?:\d+:)?\d{2}:\d{2}\.\d{4})\s+([\d.]+)\s+([\d:.]+)\s+([A-Za-z]+)\s*$'
)
PIT_HEADER = re.compile(r'^(\d+)\s+(\d{1,2})\s+(.+?)\s+([A-Z]/[A-Z]{1,2}/[A-Z])\s+(\d+)\s+Pit Stops?\b')
PIT_STOP = re.compile(r'^(\d+)\s+(\d+)\s+(\d+)\s+(\d+:\d{2}:\d{2}\.\d{4})$')


def parse_leader_laps(path):
    laps = []
    with pdfplumber.open(path) as pdf:
        for p in pdf.pages:
            text = p.extract_text() or ''
            for line in text.splitlines():
                m = LAP_LINE.match(line.strip())
                if m:
                    laps.append({
                        'lap': int(m.group(1)),
                        'car': m.group(2),
                        'driver': m.group(3).strip(),
                        'cet': m.group(4),
                        'lapTime': m.group(5),
                        'speed': float(m.group(6)),
                        'diff': m.group(7),
                        'flag': m.group(8),
                    })
    return laps


def parse_lap_chart(path):
    flags = {}
    positions = {}
    legend = {}
    lap_counter = 0
    with pdfplumber.open(path) as pdf:
        for p in pdf.pages:
            rows = defaultdict(list)
            for w in p.extract_words():
                rows[round(w['top'])].append(w)
            tops = sorted(rows.keys())
            # the flag row (single-digit values, one per lap column) anchors everything:
            # lap numbers come from cumulative column count, not from the (sometimes
            # merged) header row
            flag_top = None
            flag_words = []
            for t in tops:
                if t < 105 or t > 140:
                    continue
                ws = sorted(rows[t], key=lambda w: w['x0'])
                if len(ws) >= 3 and all(re.fullmatch(r'\d', w['text']) for w in ws):
                    flag_top = t
                    flag_words = ws
                    break
            if flag_top is None:
                continue
            n_cols = len(flag_words)
            start_lap = lap_counter + 1
            lap_counter += n_cols
            col_x = [round(w['x0']) for w in flag_words]
            for i, w in enumerate(flag_words):
                flags[start_lap + i] = int(w['text'])
            # data rows below the flag row; footer rows fail the car-number check
            for t in tops:
                if not (flag_top + 10 < t < flag_top + 560):
                    continue
                ws = sorted(rows[t], key=lambda w: w['x0'])
                if len(ws) < 4:
                    continue
                legend_words = [w for w in ws if w['x0'] < 160]
                rownum_words = [w for w in ws if 160 <= w['x0'] < 195 and re.fullmatch(r'\d+', w['text'])]
                cells = [w for w in ws if w['x0'] >= 195 and re.fullmatch(r'\d{1,2}', w['text'])]
                if not rownum_words or not legend_words or not legend_words[0]['text'].isdigit():
                    continue
                pos = int(rownum_words[0]['text'])
                car = legend_words[0]['text']
                name_text = ' '.join(w['text'] for w in legend_words[1:])
                m = re.match(r'^-\s+(.+?)\s+\((\d+)\)$', name_text)
                if m:
                    legend[car] = {'driver': m.group(1), 'startPos': int(m.group(2))}
                for w in cells:
                    best = min(range(n_cols), key=lambda i: abs(col_x[i] - w['x0']))
                    if abs(col_x[best] - w['x0']) <= 8:
                        positions.setdefault(start_lap + best, {})[pos] = w['text']
    return {'flags': flags, 'positions': positions, 'legend': legend}


def parse_event_summary(path):
    with pdfplumber.open(path) as pdf:
        text = '\n'.join((p.extract_text() or '') for p in pdf.pages)
    s = {}

    def grab(pat):
        m = re.search(pat, text)
        return m.groups() if m else None

    g = grab(r'Total Laps:\s*(\d+)\s*Green Laps:\s*(\d+)\s*Caution Laps:\s*(\d+)')
    if g:
        s['totalLaps'], s['greenLaps'], s['cautionLaps'] = map(int, g)
    g = grab(r'Time:\s*(\d{2}:\d{2}:\d{2})\s*Avg Spd:\s*([\d.]+)')
    if g:
        s['raceTime'], s['avgSpeed'] = g[0], float(g[1])
    g = grab(r'Lead Changes:\s*(\d+)\s*among\s*(\d+)\s*drivers')
    if g:
        s['leadChanges'], s['leadDrivers'] = int(g[0]), int(g[1])
    g = grab(r'Best Lap:\s*([\d.]+)\s*mph\s*\(\s*([\d.]+)\s*sec\)\s*on lap\s*(\d+)')
    if g:
        s['bestLap'] = {'mph': float(g[0]), 'sec': float(g[1]), 'lap': int(g[2])}
        m2 = re.search(r'Best Lap:.*?on lap\s*\d+\s*\nby\s+(\d+)\s*-\s*(.+)', text)
        if m2:
            s['bestLap']['car'] = int(m2.group(1))
            s['bestLap']['driver'] = m2.group(2).strip()
    g = grab(r'Best Lead Lap:\s*([\d.]+)\s*mph\s*\(\s*([\d.]+)\s*sec\)\s*on lap\s*(\d+)')
    if g:
        s['bestLeadLap'] = {'mph': float(g[0]), 'sec': float(g[1]), 'lap': int(g[2])}
        m2 = re.search(r'Best Lead Lap:.*?on lap\s*\d+\s*\nby\s+(\d+)\s*-\s*(.+)', text)
        if m2:
            s['bestLeadLap']['car'] = int(m2.group(1))
            s['bestLeadLap']['driver'] = m2.group(2).strip()
    g = grab(r'Most Improved:\s*(\d+)\s*-\s*(.+?)\s+Improved\s+(\d+)\s+positions\s+\(Started\s+(\d+)\s*/\s+Finished\s+(\d+)\)')
    if g:
        s['mostImproved'] = {'car': int(g[0]), 'driver': g[1], 'improved': int(g[2]),
                             'started': int(g[3]), 'finished': int(g[4])}
    g = grab(r'Total Passes:\s*(\d+)\s*Position Passes:\s*(\d+)')
    if g:
        s['passes'] = {'total': int(g[0]), 'position': int(g[1])}
    return s


def parse_pitstops(path):
    stops = []
    cur = None
    with pdfplumber.open(path) as pdf:
        for p in pdf.pages:
            for line in (p.extract_text() or '').splitlines():
                line = line.strip()
                m = PIT_HEADER.match(line)
                if m:
                    cur = {'rank': int(m.group(1)), 'car': m.group(2), 'driver': m.group(3),
                           'cet': m.group(4), 'total': int(m.group(5)), 'stops': []}
                    stops.append(cur)
                    continue
                m = PIT_STOP.match(line)
                if m and cur is not None:
                    cur['stops'].append({'stop': int(m.group(1)), 'lap': int(m.group(2)),
                                         'raceLap': int(m.group(3)), 'timeOfRace': m.group(4)})
    return stops


for key in RACES:
    result = {'key': key, 'event': RACES[key]}
    result['leaderLaps'] = parse_leader_laps(f'{BASE}/{key}/indycar-race-leaderlapsummary.pdf')
    result['lapChart'] = parse_lap_chart(f'{BASE}/{key}/indycar-race-lapchart.pdf')
    result['eventSummary'] = parse_event_summary(f'{BASE}/{key}/indycar-eventsummary.pdf')
    result['pitStops'] = parse_pitstops(f'{BASE}/{key}/indycar-race-pitstopsummary.pdf')
    with open(f'{OUT}/{key}.json', 'w') as f:
        json.dump(result, f, indent=1)
    nstops = sum(len(d['stops']) for d in result['pitStops'])
    print(key, 'leaderLaps:', len(result['leaderLaps']),
          'chartLaps:', len(result['lapChart']['positions']),
          'chartFlags:', len(result['lapChart']['flags']),
          'legend:', len(result['lapChart']['legend']),
          'pitDrivers:', len(result['pitStops']), 'pitStops:', nstops)
