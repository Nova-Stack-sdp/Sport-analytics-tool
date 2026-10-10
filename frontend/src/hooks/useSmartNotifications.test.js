import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import useSmartNotifications from './useSmartNotifications';
import { createNotification } from '../api/client';

jest.mock('../api/client', () => ({ createNotification: jest.fn() }));
jest.mock('../data/f1Lore', () => ({
  LORE_EVENTS: [
    { month: 10, day: 9, type: 'birthday', driverName: 'Driver', title: 'Driver birthday', note: 'Celebrate' },
    { month: 10, day: 9, type: 'lore', teamName: 'Team', title: 'Team milestone', note: 'Remember' },
  ],
  matchesFollows: (event, drivers, teams) => event.driverName ? drivers.length > 0 : teams.length > 0,
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-09T12:00:00'));
  localStorage.clear();
  createNotification.mockReset().mockResolvedValue({ id: 'notification' });
});
afterEach(() => jest.useRealTimers());
const user = { uid: 'fan' };
const follows = { drivers: [{ name: 'Driver' }], teams: [] };

test('StrictMode sends a single dated driver notification', async () => {
  renderHook(() => useSmartNotifications(user, follows), { wrapper: StrictMode });
  await act(async () => {});
  expect(createNotification).toHaveBeenCalledTimes(1);
  expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
    type: 'driver_news', eventKey: 'lore:2026-10-9:birthday:Driver',
  }));
});

test('a newly followed team is not blocked by an earlier daily driver sync', async () => {
  const { rerender } = renderHook(({ value }) => useSmartNotifications(user, value), { initialProps: { value: follows } });
  await act(async () => {});
  rerender({ value: { ...follows, teams: [{ name: 'Team' }] } });
  await act(async () => {});
  expect(createNotification).toHaveBeenCalledTimes(2);
  expect(createNotification.mock.calls[1][0].type).toBe('team_update');
});

test('annual events have a new identity next year', async () => {
  const { rerender } = renderHook(({ value }) => useSmartNotifications(user, value), { initialProps: { value: follows } });
  await act(async () => {});
  jest.setSystemTime(new Date('2027-10-09T12:00:00'));
  rerender({ value: { ...follows } });
  await act(async () => {});
  const first = createNotification.mock.calls[0][0];
  const second = createNotification.mock.calls[1][0];
  expect(first.eventKey).not.toBe(second.eventKey);
  expect(first.message).not.toBe(second.message);
});

test('signed-out visitors do not create notifications', () => {
  renderHook(() => useSmartNotifications(null, follows));
  expect(createNotification).not.toHaveBeenCalled();
});
