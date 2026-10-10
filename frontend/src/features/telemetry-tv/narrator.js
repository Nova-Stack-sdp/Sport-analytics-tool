// The narrator: decides what the broadcast crawl says next.
//
// Every moment of the race that could be said — a curated broadcast event, a
// pass read off the lap chart, a stop, a crash — is a CANDIDATE with a type,
// a time on the race clock and some text. The narrator scores every candidate
// that has already happened and picks the most important one to say next:
//
//   score = tier weight                       how much this KIND of moment matters
//         × confidence                        how sure the source is it happened
//         × front-runner boost                1.25 when the leaders are involved
//         × freshness                         0.5 ^ (age / tier half-life)
//         × variety                           0.7 if it repeats the last type said
//
// Nothing is said twice, nothing from the future is said, and a moment older
// than four half-lives has gone stale. Breaking moments (a crash, a caution,
// a lead change) PRE-EMPT whatever is crawling; everything else waits for the
// current line to finish its run across the screen. This is a salience
// scheduler with exponential decay — the same shape as the priority queues
// automated sports commentary uses — kept small enough to read and to test.
//
// Pure: no React, no timers. The ticker feeds it the clock and wall time.

export const TIERS = {
  breaking: { weight: 100, halfLife: 90 },
  major: { weight: 70, halfLife: 50 },
  standard: { weight: 40, halfLife: 30 },
  colour: { weight: 18, halfLife: 22 },
};

// What each moment is, for the crawl's tag: a short label and the page's
// tone for it (see telemetryTV.css — lead red, caution yellow, pace green,
// strategy blue, neutral).
export const CATEGORIES = {
  incident: { label: 'Incident', tone: 'lead' },
  caution: { label: 'Caution', tone: 'caution' },
  lead: { label: 'Lead change', tone: 'lead' },
  overtake: { label: 'Overtake', tone: 'pace' },
  pit: { label: 'Pit lane', tone: 'strategy' },
  strategy: { label: 'Strategy', tone: 'strategy' },
  flag: { label: 'Race control', tone: 'pace' },
  radio: { label: 'Team radio', tone: 'neutral' },
  result: { label: 'Result', tone: 'lead' },
  analysis: { label: 'Analysis', tone: 'neutral' },
};

// type -> [tier, category]. Anything unlisted is colour commentary.
const TYPES = {
  crash: ['breaking', 'incident'],
  wall_contact: ['breaking', 'incident'],
  tire_failure: ['breaking', 'incident'],
  retirement: ['breaking', 'incident'],
  dnf: ['breaking', 'incident'],
  red_flag: ['breaking', 'caution'],
  caution_start: ['breaking', 'caution'],
  lead_change: ['breaking', 'lead'],
  finish: ['breaking', 'result'],

  local_yellow: ['major', 'caution'],
  restart: ['major', 'flag'],
  green_flag: ['major', 'flag'],
  white_flag: ['major', 'flag'],
  overtake: ['major', 'overtake'],
  position_gain: ['major', 'overtake'],
  contact: ['major', 'incident'],
  pit_error: ['major', 'pit'],
  pit_issue: ['major', 'pit'],
  podium: ['major', 'result'],
  strategy_verdict: ['major', 'strategy'],

  defense: ['standard', 'overtake'],
  push_to_pass: ['standard', 'overtake'],
  pit_stop: ['standard', 'pit'],
  pit_entry: ['standard', 'pit'],
  pit_exit_event: ['standard', 'pit'],
  pits_open: ['standard', 'pit'],
  lockup: ['standard', 'incident'],
  driving_error: ['standard', 'incident'],
  driver_error: ['standard', 'incident'],
  braking_event: ['standard', 'incident'],
  caution_effect: ['standard', 'caution'],
  strategy_call: ['standard', 'strategy'],
  strategy_window: ['standard', 'strategy'],
  strategy_split: ['standard', 'strategy'],
  gap: ['standard', 'analysis'],
  traffic: ['standard', 'analysis'],
  lapped_car: ['standard', 'analysis'],
  radio: ['standard', 'radio'],
  radio_like: ['standard', 'radio'],
};

const CONFIDENCE = { high: 1, medium: 0.85, low: 0.6 };
const FRONT_BOOST = 1.25;
const REPEAT_PENALTY = 0.7;
const STALE_HALF_LIVES = 4;
// A clock that jumps back further than this (a seek) starts the story over.
const REWIND_TOLERANCE = 5;

export function classify(type) {
  const [tier, category] = TYPES[String(type ?? '').toLowerCase()] ?? ['colour', 'analysis'];
  return { tier, category, ...CATEGORIES[category] };
}

// A driver's surname, from "Colton Herta", "Herta, Colton" or plain "Herta" —
// the forms the classification, the lap chart and the curated events use.
export function surname(name) {
  const text = String(name ?? '').trim();
  const last = text.includes(',') ? text.split(',')[0] : text.split(/\s+/).at(-1);
  return (last ?? '').trim().toLowerCase();
}

function involvesFront(candidate, frontRunners) {
  if (Number.isFinite(candidate.position) && candidate.position <= 3) return true;
  if (!frontRunners?.size) return false;
  return (candidate.drivers ?? []).some((driver) => frontRunners.has(surname(driver)));
}

/**
 * Score one candidate at `now`. `scale` converts the tiers' half-lives (in
 * seconds of race) to the clock's unit: 1 for a video clock, 1/40 for a lap
 * clock (a lap is roughly forty seconds of broadcast narrative).
 */
export function scoreCandidate(candidate, now, { frontRunners, lastType, scale = 1 } = {}) {
  const age = now - candidate.at;
  if (!Number.isFinite(age) || age < 0) return 0;
  const { tier } = classify(candidate.type);
  const { weight, halfLife } = TIERS[tier];
  const life = halfLife * scale;
  if (age > life * STALE_HALF_LIVES) return 0;
  return (
    weight *
    (CONFIDENCE[candidate.confidence] ?? 1) *
    (involvesFront(candidate, frontRunners) ? FRONT_BOOST : 1) *
    0.5 ** (age / life) *
    (lastType && lastType === candidate.type ? REPEAT_PENALTY : 1)
  );
}

/** Everything sayable at `now`, most important first. */
export function rankCandidates(candidates, now, options = {}) {
  const shown = options.shown ?? new Set();
  return (candidates ?? [])
    .filter((candidate) => candidate?.text && !shown.has(candidate.id))
    .map((candidate) => ({ ...candidate, ...classify(candidate.type), score: scoreCandidate(candidate, now, options) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || b.at - a.at);
}

/**
 * How long a line stays on air, in ms: long enough to read (and, on the
 * crawl, to travel across the screen), never so long the story stalls.
 * Takes the line's text, or a candidate (headline and context together).
 */
export function dwellMs(line) {
  const text =
    typeof line === 'object' && line !== null
      ? [line.text, line.context].filter(Boolean).join(' — ')
      : String(line ?? '');
  return Math.min(20000, Math.max(6000, 3500 + text.length * 75));
}

export const initialNarratorState = {
  current: null,
  startedAt: 0,
  shown: new Set(),
  lastType: null,
  lastNow: null,
};

/**
 * One step of the scheduler: given the state, every candidate, the race clock
 * `now` and the wall clock `wallMs`, return the next state. The current line
 * holds until it has had its time on air, unless a breaking moment arrives
 * over a line that isn't breaking — then it is cut.
 */
export function stepNarrator(state, candidates, now, wallMs, options = {}) {
  let { current, startedAt, shown, lastType, lastNow } = state ?? initialNarratorState;
  if (lastNow != null && now < lastNow - REWIND_TOLERANCE * (options.scale ?? 1)) {
    current = null;
    shown = new Set();
    lastType = null;
  }

  const ranked = rankCandidates(candidates, now, { ...options, shown, lastType });
  const best = ranked[0] ?? null;
  const airTime = current ? wallMs - startedAt : Infinity;
  const preempt = best && current && best.tier === 'breaking' && current.tier !== 'breaking';
  const finished = !current || airTime >= dwellMs(current);

  if (best && (preempt || finished)) {
    const nextShown = new Set(shown);
    nextShown.add(best.id);
    return { current: best, startedAt: wallMs, shown: nextShown, lastType: best.type, lastNow: now };
  }
  return { current, startedAt, shown, lastType, lastNow: now };
}

/** The curated broadcast events, stamped with the video second they aired. */
export function videoCandidates(events) {
  return (events ?? [])
    .filter((event) => Number.isFinite(Number(event?.video_s)) && String(event?.detail ?? '').trim())
    .map((event) => ({
      id: event.id ?? `${event.type}:${event.video_s}`,
      at: Number(event.video_s),
      type: event.type ?? null,
      text: event.detail.trim(),
      drivers: Array.isArray(event.drivers) ? event.drivers : [],
      confidence: event.confidence ?? 'high',
      lap: event.lap ?? null,
      context: event.context ?? null,
    }));
}
