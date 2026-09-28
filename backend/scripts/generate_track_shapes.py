"""
Generate real track-shape JSON assets from FastF1 telemetry, one time,
offline, for every circuit in Neon that Race Replay might need. This is NOT
a live dependency of the backend — it's a standalone script you run
locally, and the resulting JSON files get committed to the repo as static
fallbacks for whichever sessions OpenF1 no longer has live /location data
for (see src/lib/trackShape.js's readStaticTrackShape, and
src/routes/raceReplay.js's track-shape endpoint, which tries live OpenF1
telemetry first and only falls back to these files).

This is a generalized version of the original generate_track_shape.py,
which produced only barcelona-track-shape.json for one specific session.
Same technique, same library, same "pick one real lap and trace it" idea —
just looped over every circuit in the CIRCUITS list below, each mapped to a
REAL past F1 event FastF1 actually has telemetry for. A circuit's physical
layout doesn't change race to race, so one real historical trace covers
every session Race Replay might show for that circuit, fictional or not.

Per the standing instruction on this project: do NOT hand-draw or
approximate a track shape — every file this script writes comes from real
FastF1 telemetry of an actual lap someone actually drove, exactly like the
original Barcelona file did. If FastF1 has no data for a circuit (see the
UNRESOLVED list below), this script deliberately produces nothing for it
rather than guessing, and Race Replay's illustrative fallback covers the
gap honestly in the meantime.

SETUP (run once):
    pip install fastf1

USAGE:
    python generate_track_shapes.py            # every circuit in CIRCUITS
    python generate_track_shapes.py spa monza   # just these slugs

I can't run this myself — my environment has no network access to fetch
real F1 data. Run it locally, then hand me the resulting JSON files in
backend/src/data/track-shapes/ and I'll confirm they're wired in correctly
(they will be, automatically — the backend looks them up by the same
slugified circuit name this script writes).

TROUBLESHOOTING:
If get_session() can't find an event for a given (year, name) pair, run
this first to see FastF1's exact event names for that year:

    import fastf1
    print(fastf1.get_event_schedule(2024)[['RoundNumber', 'EventName', 'Location']])

...and adjust that circuit's EVENT_NAME in CIRCUITS below to match exactly
(or use the round number instead — get_session(2024, <round_number>, 'R')
also works).
"""

import json
import sys
from pathlib import Path

import fastf1

TARGET_POINTS = 200   # matches TARGET_POINTS in deriveTrackShapeFromTelemetry
OUTPUT_DIR = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'track-shapes'

# --- Circuit -> real FastF1 event mapping ---------------------------------
# One entry per circuit name as it appears in Neon (see
# `Distinct circuits represented` in inspect-sessions.js's output). `slug`
# must match src/lib/trackShape.js's slugifyCircuitName() for the *Neon*
# circuit name, not necessarily the real event's own name — that's the
# join key the backend actually looks files up by.
#
# YEAR defaults to 2024 (recent, solid FastF1 telemetry coverage) unless a
# circuit needed an earlier season for some reason.
CIRCUITS = [
    {'slug': 'yas-marina-circuit', 'year': 2024, 'event': 'Abu Dhabi'},
    {'slug': 'lusail', 'year': 2024, 'event': 'Qatar'},
    {'slug': 'las-vegas', 'year': 2024, 'event': 'Las Vegas'},
    {'slug': 'interlagos', 'year': 2024, 'event': 'São Paulo'},
    {'slug': 'mexico-city', 'year': 2024, 'event': 'Mexico City'},
    {'slug': 'austin', 'year': 2024, 'event': 'United States'},
    {'slug': 'singapore', 'year': 2024, 'event': 'Singapore'},
    {'slug': 'baku', 'year': 2024, 'event': 'Azerbaijan'},
    {'slug': 'monza', 'year': 2024, 'event': 'Italy'},
    {'slug': 'zandvoort', 'year': 2024, 'event': 'Dutch'},
    {'slug': 'hungaroring', 'year': 2024, 'event': 'Hungary'},
    {'slug': 'spa-francorchamps', 'year': 2024, 'event': 'Belgium'},
    {'slug': 'silverstone', 'year': 2024, 'event': 'British'},
    {'slug': 'spielberg', 'year': 2024, 'event': 'Austria'},
    {'slug': 'catalunya', 'year': 2024, 'event': 'Spain'},  # already have this one — see NOTE below
    {'slug': 'monte-carlo', 'year': 2024, 'event': 'Monaco'},
    {'slug': 'montreal', 'year': 2024, 'event': 'Canada'},
    {'slug': 'miami', 'year': 2024, 'event': 'Miami'},
    {'slug': 'suzuka', 'year': 2024, 'event': 'Japan'},
    {'slug': 'shanghai', 'year': 2024, 'event': 'China'},
    {'slug': 'melbourne', 'year': 2024, 'event': 'Australia'},
    {'slug': 'imola', 'year': 2024, 'event': 'Emilia Romagna'},
    {'slug': 'jeddah', 'year': 2024, 'event': 'Saudi Arabia'},
    {'slug': 'sakhir', 'year': 2024, 'event': 'Bahrain'},
]

# NOTE on 'catalunya': the original one-off script already produced a real
# FastF1-derived file for this circuit (backend/src/data/barcelona-track-shape.json,
# duplicated to src/data/track-shapes/catalunya.json). It's listed here too
# so re-running this script regenerates it the same way everything else
# does, but you don't strictly need to re-run it just for this circuit.

# Two circuits from Neon's fixture list could NOT be confidently mapped to
# a real FastF1 event — I'm flagging this rather than guessing, per the
# standing instruction not to fabricate track data:
#   - "Kuala Lumpur" (used for a fictional 2026 "Bahrain Grand Prix" in
#     this dataset) — no real Formula 1 race has been held at a Kuala
#     Lumpur circuit in the FastF1-covered era (Malaysia's real F1 venue,
#     when it hosted the sport, was Sepang — a different circuit). I don't
#     know what specific layout this fictional entry represents, so I'm not
#     guessing a substitute.
#   - "Madring" (used for a fictional 2026 "Spanish Grand Prix") — a real
#     Madrid circuit is on F1's actual calendar starting in 2026, but my
#     knowledge cutoff (Jan 2026) is before that first race happened, so I
#     can't confirm FastF1 has telemetry for it yet, or confirm the exact
#     event name it would use. Try adding it yourself once you know: run
#     the TROUBLESHOOTING snippet above against YEAR=2026 and look for a
#     Madrid-related EventName.
# Both simply won't get a file from this script — Race Replay's
# illustrative fallback covers them until one becomes available for real.
UNRESOLVED = ['kuala-lumpur', 'madring']

SESSION_TYPE = 'R'  # Race

cache_dir = Path(__file__).resolve().parent / '.fastf1-cache'
cache_dir.mkdir(exist_ok=True)
fastf1.Cache.enable_cache(str(cache_dir))


def pick_reference_lap(session):
    """
    Prefer the fastest lap (typically the cleanest, least traffic-affected
    line around the circuit). Falls back to whichever lap has the most
    telemetry samples if the fastest lap's telemetry is incomplete.
    """
    try:
        fastest = session.laps.pick_fastest()
        telemetry = fastest.get_telemetry()
        if len(telemetry) >= 50:
            return fastest, telemetry
    except Exception as err:
        print(f'  pick_fastest() telemetry unavailable ({err}), scanning all laps instead')

    best_lap = None
    best_telemetry = None
    best_len = 0
    for _, lap in session.laps.iterlaps():
        try:
            telemetry = lap.get_telemetry()
        except Exception:
            continue
        if len(telemetry) > best_len:
            best_lap, best_telemetry, best_len = lap, telemetry, len(telemetry)

    if best_lap is None:
        raise RuntimeError('No lap with usable telemetry found in this session.')
    return best_lap, best_telemetry


def downsample(points, target_count):
    if len(points) <= target_count:
        return points
    step = max(1, len(points) // target_count)
    return points[::step]


def generate_one(circuit):
    slug = circuit['slug']
    year = circuit['year']
    event_name = circuit['event']
    output_path = OUTPUT_DIR / f'{slug}.json'

    print(f'[{slug}] Loading {year} {event_name} ({SESSION_TYPE})...')
    session = fastf1.get_session(year, event_name, SESSION_TYPE)
    session.load(telemetry=True, laps=True, weather=False)

    lap, telemetry = pick_reference_lap(session)
    print(f'[{slug}] Using driver {lap["Driver"]}, lap {lap["LapNumber"]}, {len(telemetry)} telemetry points')

    raw_points = [
        {'x': float(x), 'y': float(y)}
        for x, y in zip(telemetry['X'], telemetry['Y'])
        if x == x and y == y  # drops NaN (x != x is true only for NaN)
    ]

    if len(raw_points) < 10:
        raise RuntimeError(f'Only {len(raw_points)} usable X/Y points — not enough to build a track shape.')

    points = downsample(raw_points, TARGET_POINTS)

    output = {
        'points': points,
        'source': 'fastf1',
        'sourceDriver': str(lap['Driver']),
        'sourceLap': int(lap['LapNumber']),
        'session': f'{year} {event_name} {SESSION_TYPE}',
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2))
    print(f'[{slug}] Wrote {len(points)} points to {output_path}')


def main():
    requested_slugs = sys.argv[1:] or [c['slug'] for c in CIRCUITS]

    if any(s in UNRESOLVED for s in requested_slugs):
        print(f'NOTE: {", ".join(s for s in requested_slugs if s in UNRESOLVED)} '
              f'has no confirmed real FastF1 event mapped — see the UNRESOLVED comment above. Skipping.')
        requested_slugs = [s for s in requested_slugs if s not in UNRESOLVED]

    by_slug = {c['slug']: c for c in CIRCUITS}
    unknown = [s for s in requested_slugs if s not in by_slug]
    if unknown:
        print(f'Unknown circuit slug(s), skipping: {", ".join(unknown)}')

    succeeded, failed = [], []
    for slug in requested_slugs:
        circuit = by_slug.get(slug)
        if not circuit:
            continue
        try:
            generate_one(circuit)
            succeeded.append(slug)
        except Exception as err:
            print(f'[{slug}] FAILED: {err}')
            failed.append(slug)

    print(f'\nDone. {len(succeeded)} succeeded, {len(failed)} failed.')
    if failed:
        print(f'Failed: {", ".join(failed)}')
        print('Re-run TROUBLESHOOTING steps above for these — the event name likely needs adjusting.')


if __name__ == '__main__':
    main()
