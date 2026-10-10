import {
  classify,
  dwellMs,
  initialNarratorState,
  rankCandidates,
  scoreCandidate,
  stepNarrator,
  surname,
  TIERS,
  videoCandidates,
} from './narrator';

const at = (id, type, seconds, extra = {}) => ({ id, type, at: seconds, text: `${type} ${id}`, ...extra });

describe('classify', () => {
  test('crashes, cautions, lead changes and the finish are breaking', () => {
    for (const type of ['crash', 'wall_contact', 'caution_start', 'lead_change', 'retirement', 'finish']) {
      expect(classify(type).tier).toBe('breaking');
    }
  });

  test('passes and restarts are major, stops are routine, analysis is colour', () => {
    expect(classify('overtake')).toMatchObject({ tier: 'major', label: 'Overtake', tone: 'pace' });
    expect(classify('restart').tier).toBe('major');
    expect(classify('pit_stop')).toMatchObject({ tier: 'standard', label: 'Pit lane', tone: 'strategy' });
    expect(classify('pace_snapshot')).toMatchObject({ tier: 'colour', label: 'Analysis' });
    expect(classify(undefined).tier).toBe('colour');
  });
});

describe('scoreCandidate', () => {
  test('a fresh moment scores its tier weight', () => {
    expect(scoreCandidate(at('a', 'crash', 100), 100)).toBe(TIERS.breaking.weight);
    expect(scoreCandidate(at('b', 'overtake', 100), 100)).toBe(TIERS.major.weight);
  });

  test('freshness halves every half-life, and a moment four half-lives old is stale', () => {
    const pass = at('a', 'overtake', 0);
    expect(scoreCandidate(pass, TIERS.major.halfLife)).toBeCloseTo(TIERS.major.weight / 2, 9);
    expect(scoreCandidate(pass, TIERS.major.halfLife * 2)).toBeCloseTo(TIERS.major.weight / 4, 9);
    expect(scoreCandidate(pass, TIERS.major.halfLife * 4 + 1)).toBe(0);
  });

  test('the future is never said', () => {
    expect(scoreCandidate(at('a', 'crash', 200), 100)).toBe(0);
  });

  test('confidence, the leaders and variety move the weight', () => {
    expect(scoreCandidate(at('a', 'overtake', 0, { confidence: 'low' }), 0)).toBeCloseTo(70 * 0.6, 9);
    expect(
      scoreCandidate(at('b', 'overtake', 0, { drivers: ['Colton Herta'] }), 0, {
        frontRunners: new Set(['herta']),
      })
    ).toBeCloseTo(70 * 1.25, 9);
    expect(scoreCandidate(at('c', 'overtake', 0, { position: 2 }), 0)).toBeCloseTo(70 * 1.25, 9);
    expect(scoreCandidate(at('d', 'overtake', 0), 0, { lastType: 'overtake' })).toBeCloseTo(70 * 0.7, 9);
  });

  test('a lap clock scales the half-lives down to laps', () => {
    // 1/40: the major half-life of 50 s of broadcast is 1.25 laps.
    expect(scoreCandidate(at('a', 'overtake', 10), 11.25, { scale: 1 / 40 })).toBeCloseTo(35, 9);
  });
});

describe('rankCandidates', () => {
  test('the most important unsaid moment comes first; what was said is gone', () => {
    const candidates = [
      at('note', 'pace_snapshot', 95),
      at('pass', 'overtake', 90),
      at('crash', 'crash', 60),
      at('stop', 'pit_stop', 99),
    ];
    // At 100 s: the 40 s-old crash still outweighs a 10 s-old pass.
    expect(rankCandidates(candidates, 100).map((c) => c.id)).toEqual(['crash', 'pass', 'stop', 'note']);
    expect(rankCandidates(candidates, 100, { shown: new Set(['crash']) })[0].id).toBe('pass');
  });

  test('a much older crash gives way to a fresh pass', () => {
    const candidates = [at('crash', 'crash', 0), at('pass', 'overtake', 200)];
    expect(rankCandidates(candidates, 200)[0].id).toBe('pass');
  });
});

describe('stepNarrator', () => {
  const step = (state, candidates, now, wallMs, options) =>
    stepNarrator(state, candidates, now, wallMs, options);

  test('with nothing on air, the best moment airs at once', () => {
    const state = step(initialNarratorState, [at('a', 'overtake', 10), at('b', 'pit_stop', 10)], 10, 0);
    expect(state.current.id).toBe('a');
    expect(state.shown.has('a')).toBe(true);
  });

  test('a line holds for its air time, then hands over to the next best', () => {
    const candidates = [at('a', 'overtake', 10), at('b', 'pit_stop', 10)];
    let state = step(initialNarratorState, candidates, 10, 0);
    state = step(state, candidates, 11, 1000);
    expect(state.current.id).toBe('a');
    state = step(state, candidates, 15, dwellMs(state.current.text));
    expect(state.current.id).toBe('b');
  });

  test('a breaking moment cuts in over a line that is not breaking', () => {
    let state = step(initialNarratorState, [at('a', 'overtake', 10)], 10, 0);
    state = step(state, [at('a', 'overtake', 10), at('crash', 'crash', 12)], 12, 500);
    expect(state.current).toMatchObject({ id: 'crash', tier: 'breaking' });
  });

  test('but one breaking moment never cuts another off mid-sentence', () => {
    let state = step(initialNarratorState, [at('c1', 'crash', 10)], 10, 0);
    state = step(state, [at('c1', 'crash', 10), at('c2', 'caution_start', 12)], 12, 500);
    expect(state.current.id).toBe('c1');
  });

  test('when there is nothing new to say, the last line stays on air', () => {
    let state = step(initialNarratorState, [at('a', 'overtake', 10)], 10, 0);
    state = step(state, [at('a', 'overtake', 10)], 20, 60000);
    expect(state.current.id).toBe('a');
  });

  test('seeking back starts the story over', () => {
    const candidates = [at('a', 'overtake', 10), at('b', 'overtake', 100)];
    let state = step(initialNarratorState, candidates, 100, 0);
    expect(state.current.id).toBe('b');
    state = step(state, candidates, 12, 100);
    expect(state.current.id).toBe('a');
  });
});

describe('helpers', () => {
  test('air time grows with the line and stays within bounds', () => {
    expect(dwellMs('short')).toBe(6000);
    expect(dwellMs('x'.repeat(100))).toBe(11000);
    expect(dwellMs('x'.repeat(1000))).toBe(20000);
  });

  test("a line's air time covers its context as well as its headline", () => {
    const line = { text: 'x'.repeat(40), context: 'y'.repeat(57) };
    // 40 + " — " (3) + 57 = 100 characters.
    expect(dwellMs(line)).toBe(dwellMs('z'.repeat(100)));
    expect(dwellMs({ text: 'x'.repeat(100) })).toBe(11000);
  });

  test('surnames from every form the sources use', () => {
    expect(surname('Colton Herta')).toBe('herta');
    expect(surname('Herta, Colton')).toBe('herta');
    expect(surname("Pato O'Ward")).toBe("o'ward");
  });

  test('video candidates keep only stamped, worded events', () => {
    const list = videoCandidates([
      { id: 'e1', video_s: 535, type: 'green_flag', detail: ' Green flag. ', drivers: ['Herta'] },
      { id: 'e2', type: 'gap', detail: 'No stamp.' },
      { id: 'e3', video_s: 600, type: 'gap', detail: '   ' },
    ]);
    expect(list).toEqual([
      {
        id: 'e1',
        at: 535,
        type: 'green_flag',
        text: 'Green flag.',
        drivers: ['Herta'],
        confidence: 'high',
        lap: null,
        context: null,
      },
    ]);
  });
});
