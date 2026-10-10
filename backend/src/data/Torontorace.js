import { torontoAnchors } from './torontoAnchors.js';

export const torontorace = {
  raceSlug: 'toronto-2025',
  eventName: 'Ontario Honda Dealers Indy Toronto',
  venue: 'Exhibition Place, Toronto',
  // Where and when to read race-day weather (see lib/raceWeather.js). The
  // date is the fallback when the report's own session date can't be read;
  // the hours are the race-day afternoon, local time — the reports carry no
  // wall-clock race times, so the header names the window it read.
  weatherLookup: {
    latitude: 43.6333,
    longitude: -79.4186,
    timezone: 'America/Toronto',
    date: '2025-07-20',
    fromHour: 12,
    toHour: 17,
  },
  // Curated video->lap anchors (green flag, stated laps, "N to go" calls) so
  // the player clock maps to the right lap instead of the rough shipped clock.
  lapCalibration: torontoAnchors.lapCalibration,
  paceAndStrategy: {
    headline: 'Pace & Strategy Intelligence',
    subtitle: 'Current race rhythm, tire strategy, and pressure points',
    weather: {
      note: 'Dry race conditions with quick grip evolution; the track ramps up rapidly from warm-up into green.',
      grip: 'The field settles into rhythm quickly, making small pace gains and carefully managed tire life more valuable than raw top speed.',
    },
    strategySignals: [
      {
        label: 'Track evolution',
        value: 'Grip compresses the field',
        detail: 'As the circuit cleans up, the front group becomes more sensitive to tire window and pit timing.',
      },
      {
        label: 'Tire window',
        value: 'Manage tire life',
        detail: 'The harder compound offers better life, but the true advantage sits in the precise stint window before degradation hits.',
      },
      {
        label: 'Stop timing',
        value: 'Under/overcut window',
        detail: 'Toronto is a race where defending position and perfect stop timing can make or break a strategy cycle.',
      },
    ],
  },
  narrative: 'Toronto is a street circuit where tire life, braking discipline, and pit timing matter as much as top speed. The most valuable live insight is usually the relative pace between the front group and the cars on fresh tires, not just the leader’s lap time.',
  // 125 curated broadcast events, each stamped with the video second it aired
  // on, so the ticker can follow playback instead of the lap cursor alone.
  events: torontoAnchors.events,
  // Lap-level pit stops rebuilt from the broadcast: Toronto's official pit
  // stop summary ships empty, so each stop carries the lap stated on air or
  // one interpolated from the video calibration.
  pitStops: torontoAnchors.pitStops,
};

export function getTorontoraceContext() {
  return {
    ...torontorace,
    paceAndStrategy: {
      ...torontorace.paceAndStrategy,
    },
  };
}
