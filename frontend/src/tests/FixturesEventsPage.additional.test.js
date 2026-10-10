import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FixturesEventsPage from '../pages/FixturesEventsPage';
import { getFixtureEvents, getFixtures } from '../api/client';

jest.mock('../api/client', () => ({ getFixtures: jest.fn(), getFixtureEvents: jest.fn() }));

const fixtures = {
  fixtures: [
    { id: 'a', meetingName: 'Finished GP', type: 'Race', season: 2026, startTime: '2026-01-03T12:00:00Z', hasCorrections: false, status: 'finished', eventCount: 5 },
    { id: 'b', meetingName: 'Live GP', type: 'Race', season: 2026, startTime: '2026-01-02T12:00:00Z', hasCorrections: false, status: 'live' },
    { id: 'c', meetingName: 'Scheduled GP', type: 'FP1', season: 2026, startTime: '2026-01-01T12:00:00Z', hasCorrections: false, status: 'scheduled' },
    { id: 'd', meetingName: 'Odd GP', type: 'Race', season: 2026, startTime: null, hasCorrections: false, status: 'planned' },
  ],
};

const events = {
  session: { meetingName: 'Finished GP', type: 'Race', startTime: '2026-01-03T12:00:00Z' },
  derivedStatsCount: 1,
  events: [
    { id: 'one', occurredAt: '2026-01-01T13:00:00Z', isCorrection: false, superseded: true, driverName: 'Max', eventType: 'pit_stop', lapNumber: 5, payload: {} },
    { id: 'two', occurredAt: null, isCorrection: false, superseded: false, driverName: null, eventType: 'something_new', lapNumber: null, payload: null },
  ],
  page: { total: 2, nextCursor: null },
};

function renderPage() {
  return render(<MemoryRouter><FixturesEventsPage /></MemoryRouter>);
}

describe('FixturesEventsPage additional states', () => {
  beforeEach(() => jest.clearAllMocks());

  test('renders every status, a replaced version, an unknown event type, and a single season without a picker', async () => {
    getFixtures.mockResolvedValue(fixtures);
    getFixtureEvents.mockResolvedValue(events);
    renderPage();
    await screen.findByText(/Session statistics for 1 driver are derived/);

    expect(screen.getByText('Finished')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('planned')).toBeInTheDocument();
    expect(screen.getByText('Replaced')).toBeInTheDocument();
    expect(screen.getByText('something new')).toBeInTheDocument();
    expect(screen.getByText('Lap 5')).toBeInTheDocument();
    expect(screen.queryByLabelText('Season')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  test('handles empty fixtures, fixture API failures, and event API failures', async () => {
    getFixtures.mockResolvedValueOnce({ fixtures: [] });
    renderPage();
    expect(await screen.findByText('No fixtures synced yet.')).toBeInTheDocument();
    expect(screen.getByText('Select a fixture to see its event log.')).toBeInTheDocument();

    getFixtures.mockRejectedValueOnce(new Error('fixtures unavailable'));
    renderPage();
    expect(await screen.findByText(/Couldn't load the fixtures: fixtures unavailable/i)).toBeInTheDocument();

    getFixtures.mockResolvedValueOnce({ fixtures: [fixtures.fixtures[0]] });
    getFixtureEvents.mockRejectedValueOnce(new Error('events unavailable'));
    renderPage();
    expect(await screen.findByText(/Couldn't load the event log: events unavailable/i)).toBeInTheDocument();
  });

  test('shows the no-events and no-statistics states and ignores requests which settle after unmount', async () => {
    getFixtures.mockResolvedValueOnce({ fixtures: [fixtures.fixtures[0]] });
    getFixtureEvents.mockResolvedValueOnce({ ...events, events: [], derivedStatsCount: 0, page: { total: 0, nextCursor: null } });
    renderPage();
    expect(await screen.findByText('No events recorded for this fixture.')).toBeInTheDocument();
    expect(screen.getByText(/No statistics have been derived from this event log yet/)).toBeInTheDocument();

    let resolve;
    getFixtures.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const pending = renderPage();
    pending.unmount();
    await act(async () => resolve(fixtures));
    expect(getFixtures).toHaveBeenCalledTimes(2);
  });
});
