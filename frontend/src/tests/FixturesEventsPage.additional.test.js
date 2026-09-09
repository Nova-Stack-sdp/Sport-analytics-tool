import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FixturesEventsPage from '../pages/FixturesEventsPage';
import { getFixtureEvents, getFixtures } from '../api/client';

jest.mock('../api/client', () => ({ getFixtures: jest.fn(), getFixtureEvents: jest.fn() }));

const fixtures = {
  fixtures: [
    { id: 'corrected', meetingName: 'Corrected GP', startTime: '2026-01-01T12:00:00Z', hasCorrections: true, status: 'finished' },
    { id: 'live', meetingName: 'Live GP', startTime: '2026-01-02T12:00:00Z', hasCorrections: false, status: 'live' },
    { id: 'finished', meetingName: 'Finished GP', startTime: '2026-01-03T12:00:00Z', hasCorrections: false, status: 'finished' },
    { id: 'scheduled', meetingName: 'Scheduled GP', startTime: null, hasCorrections: false, status: 'planned' },
  ],
};

const events = {
  session: { meetingName: 'Corrected GP', type: 'Race' },
  derivedStatsCount: 1,
  events: [
    { id: 'one', occurredAt: '2026-01-01T13:00:00Z', corrected: true, driverName: 'Max', eventType: 'pit_stop', lapNumber: 5 },
    { id: 'two', occurredAt: null, corrected: false, driverName: null, eventType: 'flag', lapNumber: null },
  ],
};

function renderPage() {
  return render(<MemoryRouter><FixturesEventsPage /></MemoryRouter>);
}

describe('FixturesEventsPage additional states', () => {
  beforeEach(() => jest.clearAllMocks());

  test('renders every fixture status and event-log display branch', async () => {
    getFixtures.mockResolvedValue(fixtures);
    getFixtureEvents.mockResolvedValue(events);
    renderPage();
    await screen.findByText('Corrected GP');
    await screen.findByText('1 stat recomputed', { exact: false });

    expect(screen.getAllByText('Corrected').length).toBeGreaterThan(1);
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('PIT_STOP · Lap 5')).toBeInTheDocument();
    expect(screen.getByText('FLAG')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'view derived statistics' })).toHaveAttribute('href', '/statistics');

    fireEvent.click(screen.getByText('Live GP'));
    await waitFor(() => expect(getFixtureEvents).toHaveBeenLastCalledWith('live'));
  });

  test('handles empty fixtures, fixture API failures, and event API failures', async () => {
    getFixtures.mockResolvedValueOnce({ fixtures: [] });
    renderPage();
    expect(await screen.findByText('No fixtures synced yet.')).toBeInTheDocument();
    expect(screen.getByText('Select a fixture to see its event log.')).toBeInTheDocument();

    getFixtures.mockRejectedValueOnce(new Error('fixtures unavailable'));
    renderPage();
    expect(await screen.findByText(/fixtures unavailable/i)).toBeInTheDocument();

    getFixtures.mockResolvedValueOnce({ fixtures: [fixtures.fixtures[0]] });
    getFixtureEvents.mockRejectedValueOnce(new Error('events unavailable'));
    renderPage();
    expect(await screen.findByText(/events unavailable/i)).toBeInTheDocument();
  });

  test('shows the no-events response and ignores requests which settle after unmount', async () => {
    getFixtures.mockResolvedValueOnce({ fixtures: [fixtures.fixtures[0]] });
    getFixtureEvents.mockResolvedValueOnce({ ...events, events: [], derivedStatsCount: 2 });
    renderPage();
    expect(await screen.findByText('No events recorded for this fixture.')).toBeInTheDocument();
    expect(screen.getByText('2 stats recomputed', { exact: false })).toBeInTheDocument();

    let resolve;
    getFixtures.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const pending = renderPage();
    pending.unmount();
    await act(async () => resolve(fixtures));
    expect(getFixtures).toHaveBeenCalledTimes(2);
  });
});
