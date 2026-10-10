import { eventTypeLabel, percent, sessionLabel, submissionSourceLabel } from './eventLabels';

test('event types read as words, unknown ones degrade gracefully', () => {
  expect(eventTypeLabel('lap_completed')).toBe('Lap completed');
  expect(eventTypeLabel('classification')).toBe('Result');
  expect(eventTypeLabel('brand_new_type')).toBe('brand new type');
  expect(eventTypeLabel(null)).toBe('—');
});

test('submission sources read as words', () => {
  expect(submissionSourceLabel('openf1_sync')).toBe('OpenF1 sync');
  expect(submissionSourceLabel('manual_upload')).toBe('Developer upload');
  expect(submissionSourceLabel(undefined)).toBe('—');
});

test('session labels and percentages', () => {
  expect(sessionLabel({ meetingName: 'Abu Dhabi Grand Prix', type: 'Race' })).toBe('Abu Dhabi Grand Prix · Race');
  expect(sessionLabel(null)).toBe('—');
  expect(percent(0.6666666)).toBe('67%');
  expect(percent(1)).toBe('100%');
  expect(percent(null)).toBe('—');
});
