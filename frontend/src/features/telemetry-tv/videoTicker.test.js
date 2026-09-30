import { pickVideoTickerEvent } from './videoTicker';

const EVENTS = [
  { id: 'e007', video_s: 535, type: 'green_flag', lap: 1, detail: 'Green flag. Herta (pole) leads.' },
  { id: 'e009', video_s: 567, type: 'overtake', lap: 1, detail: 'Kirkwood passes Palou for 3rd on lap 1.' },
  { id: 'e063', video_s: 3170, type: 'crash', lap: 37, detail: 'Restart pileup at turn 1.' },
];

test('picks the most recent event at or before the reported video second', () => {
  expect(pickVideoTickerEvent(EVENTS, 536).id).toBe('e007');
  expect(pickVideoTickerEvent(EVENTS, 567).id).toBe('e009');
  expect(pickVideoTickerEvent(EVENTS, 5000).id).toBe('e063');
});

test('resolves ties towards the later event in the stream', () => {
  const sameSecond = [
    { id: 'first', video_s: 100, detail: 'First at 100.' },
    { id: 'second', video_s: 100, detail: 'Second at 100.' },
  ];

  expect(pickVideoTickerEvent(sameSecond, 100).id).toBe('second');
});

test('returns the display shape used by the ticker', () => {
  const picked = pickVideoTickerEvent(
    [{ id: 'x', videoSeconds: 100, type: 'gap', detail: ' Gap opens to 1.2 s. ' }],
    150
  );

  expect(picked).toEqual({
    id: 'x',
    videoSeconds: 100,
    type: 'gap',
    description: 'Gap opens to 1.2 s.',
  });
});

test('returns null before the first event or without a player clock', () => {
  expect(pickVideoTickerEvent(EVENTS, 200)).toBeNull();
  expect(pickVideoTickerEvent(EVENTS, null)).toBeNull();
  expect(pickVideoTickerEvent(null, 600)).toBeNull();
  expect(pickVideoTickerEvent(EVENTS, Number.NaN)).toBeNull();
});

test('ignores events without a video stamp or readable text', () => {
  expect(pickVideoTickerEvent([{ id: 'a', detail: 'No stamp.' }], 600)).toBeNull();
  expect(pickVideoTickerEvent([{ id: 'b', video_s: 10, detail: '   ' }], 600)).toBeNull();
  expect(pickVideoTickerEvent([{ id: 'c', video_s: 10 }], 600)).toBeNull();
});

test('keeps working when the stream is not sorted by time', () => {
  const unsorted = [EVENTS[2], EVENTS[1], EVENTS[0]];

  expect(pickVideoTickerEvent(unsorted, 600).id).toBe('e009');
  expect(pickVideoTickerEvent(unsorted, 4000).id).toBe('e063');
});
