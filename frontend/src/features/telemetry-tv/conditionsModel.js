// The conditions behind the instrument panel's weather glyph: the curator's
// own words turned into the three facts a small icon can honestly carry —
// sky state, grip trend and how hot the day is.
//
// Everything here is read OUT of the broadcast curator's text ("dry race
// conditions ...", "grip evolution"), never inferred from anything else, and
// the panel always prints that text beside the glyph so the icon is a summary
// of what the curator said rather than a sensor reading. When the words are
// not there the model says so (`sky.key: 'unknown'`) instead of guessing a sky.
// Pure functions only — unit-testable without a browser.

// A note can name the rain and then rule it out in the same breath ("no rain
// calls, the circuit ramps up"). Those rulings are stripped before the wet
// keywords are counted, or every dry race the curator wrote becomes wet.
const NEGATED_WET = /\b(?:no|without|zero)\s+(?:rain|rainfall|showers?|wet)\b[^.;]*/g;

const WET = /\brain(?:fall|y|s)?\b|\bshowers?\b|\bwet\b|\bdamp\b|\bstanding water\b|\bstorm\b/;
const DRY = /\bdry\b|\bdrying\b|\bsun(?:ny|shine)?\b|\bclear skies\b|\bno rain\b/;
// Word boundaries, and no bare "warm" — the curators use "warm-up" to mean the
// pre-race session, which has nothing to do with the air temperature.
const HOT = /\bhot\b|\bhumid\b|\bheatwave\b|\bscorching\b/;
const COOL = /\bcool\b|\bcold\b|\bchilly\b/;

const GRIP_RISING = /grip (?:evolution|builds|comes in|improves)|\bramps? up\b|\bcleans? up\b|\brubber(?:s)? in\b|\bfaster quickly\b|\btrack evolution\b/;
const GRIP_FALLING = /grip (?:falls|drops|fades|goes away)|\bgreasy\b|\blosing grip\b/;

const SKY_LABELS = {
  dry: 'Dry',
  mixed: 'Mixed',
  wet: 'Wet',
  unknown: 'Not stated',
};

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function buildConditionsModel(intelligence) {
  const weather = intelligence?.weather ?? null;
  const note = text(weather?.note);
  const grip = text(weather?.grip);
  if (note === '' && grip === '') return null;

  // Everything that classifies the sky is read from the conditions note: the
  // grip paragraph is about tyre behaviour ("a performance cliff after about
  // 17 laps"), which would misread as the track losing grip.
  const sky = `${note} ${grip}`.toLowerCase().replace(NEGATED_WET, ' ');
  const wet = WET.test(sky);
  const dry = DRY.test(sky);
  const skyKey = wet && dry ? 'mixed' : wet ? 'wet' : dry ? 'dry' : 'unknown';

  const gripTrend = GRIP_RISING.test(note.toLowerCase())
    ? { key: 'rising', label: 'Grip building' }
    : GRIP_FALLING.test(note.toLowerCase())
      ? { key: 'falling', label: 'Grip fading' }
      : null;

  const heat = HOT.test(note.toLowerCase())
    ? { key: 'hot', label: 'Hot day' }
    : COOL.test(note.toLowerCase())
      ? { key: 'cool', label: 'Cool day' }
      : null;

  return {
    note,
    grip,
    sky: { key: skyKey, label: SKY_LABELS[skyKey] },
    gripTrend,
    heat,
    // The tile is a summary of the curator's read, and says so on screen.
    source: 'Curator read',
    summary: [SKY_LABELS[skyKey], gripTrend?.label, heat?.label].filter(Boolean).join(' · '),
  };
}
