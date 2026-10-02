import { longBeachAnchors } from './longBeachAnchors.js';

export const longbeachrace = {
  raceSlug: 'long-beach-2023',
  eventName: 'Acura Grand Prix of Long Beach',
  venue: 'Streets of Long Beach, California',
  // Curated video->lap anchors from the broadcast (green flag, restarts,
  // "N to go" calls), shifted onto the lap-in-progress convention the
  // player's clock maps onto, so playback tracks the right lap throughout.
  lapCalibration: longBeachAnchors.lapCalibration,
  paceAndStrategy: {
    headline: 'Pace & Strategy Intelligence',
    subtitle: 'Current race rhythm, tire strategy, and pressure points',
    weather: {
      note: 'A dry 85-lap run through the Long Beach streets, decided by tire life and pit timing around two cautions.',
      grip: 'The alternate tire hits a performance cliff after about 17 laps; the crossover to primaries lands 5-7 laps after the lap-26 restart.',
    },
    strategySignals: [
      {
        label: 'Tire life curve',
        value: 'Alternate cliff ~17 laps',
        detail: 'The broadcast model flags the alternate falling off a cliff around 17 laps — stint length, not raw pace, sets the pit windows.',
      },
      {
        label: 'Overcut window',
        value: 'Fresh rubber pays out',
        detail: 'Grosjean overcuts Newgarden, and Kirkwood jumps both around the final stops — the passes that decided the podium were made in the pit cycle.',
      },
      {
        label: 'Push-to-pass budget',
        value: '30 s authorised at lap 83',
        detail: 'Balances aired at laps 40, 60, 68 and 76 — the run to the flag is fought on deployment as much as on pace.',
      },
    ],
  },
  narrative: 'Long Beach 2023 was Kirkwood’s breakthrough — first career pole converted into a first win, with Grosjean second for an Andretti 1-2 and Ericsson third. The race turned on the caution stops at laps 22-25 and a string of overcuts; Dixon and Canapino retired with damage and mechanical trouble, and Palou set the fastest lap late.',
  // 86 curated broadcast events, each stamped with the video second it aired
  // on, so the ticker can follow playback instead of the lap cursor alone.
  events: longBeachAnchors.events,
  // Broadcast-called stops only (9 drivers / 12 of the field’s official
  // stops); the bundle’s parsed official pit data takes precedence when the
  // route serves it, and the timeline labels partial coverage honestly.
  pitStops: longBeachAnchors.pitStops,
};

export function getLongBeachraceContext() {
  return {
    ...longbeachrace,
    paceAndStrategy: {
      ...longbeachrace.paceAndStrategy,
    },
  };
}
