import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import FixturesEventsPage from '../pages/FixturesEventsPage';
import { getFixtures, getFixtureEvents } from '../api/client';

jest.mock('../api/client');

const fixturesResponse = {
  fixtures: [
    {
      id: 's1', meetingName: 'Bahrain Grand Prix', circuitName: 'Sakhir', country: 'Bahrain', season: 2024,
      type: 'Race', startTime: '2024-03-02T15:00:00.000Z', status: 'finished', hasCorrections: false, eventCount: 1520,
    },
    {
      id: 's1q', meetingName: 'Bahrain Grand Prix', circuitName: 'Sakhir', country: 'Bahrain', season: 2024,
      type: 'Q', startTime: '2024-03-01T16:00:00.000Z', status: 'finished', hasCorrections: true, eventCount: 300,
    },
    {
      id: 's2', meetingName: 'Australian Grand Prix', circuitName: 'Albert Park', country: 'Australia', season: 2023,
      type: 'Race', startTime: '2023-04-02T05:00:00.000Z', status: 'finished', hasCorrections: false, eventCount: 0,
    },
  ],
};

const eventsResponse = {
  session: { id: 's1', meetingName: 'Bahrain Grand Prix', type: 'Race', startTime: '2024-03-02T15:00:00.000Z' },
  derivedStatsCount: 20,
  events: [
    {
      id: 'e1', eventType: 'classification', lapNumber: null, occurredAt: '2024-03-02T17:00:00.000Z', driverName: 'Max VERSTAPPEN',
      payload: { final_position: 1, points: 25, status: 'finished' }, isCorrection: false, superseded: false,
    },
    {
      id: 'e0', eventType: 'grid_position', lapNumber: 0, occurredAt: '2024-03-02T15:00:00.000Z', driverName: 'Max VERSTAPPEN',
      payload: { position: 1 }, isCorrection: false, superseded: false,
    },
    {
      id: 'e2', eventType: 'pit_stop', lapNumber: 17, occurredAt: '2024-03-02T15:40:00.000Z', driverName: 'Lando NORRIS',
      payload: { pit_duration_ms: 23400 }, isCorrection: true, superseded: false,
    },
  ],
  page: { total: 1520, nextCursor: 'e2' },
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

function renderPage(path = '/fixtures') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/fixtures" element={<><FixturesEventsPage /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  getFixtures.mockResolvedValue(fixturesResponse);
  getFixtureEvents.mockResolvedValue(eventsResponse);
});

describe('FixturesEventsPage', () => {
  test('lists the newest season, telling sessions of one meeting apart, and opens the newest fixture', async () => {
    renderPage();

    await screen.findAllByText('Bahrain Grand Prix');
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2); // 2024 only; 2023 is behind the season picker
    expect(within(rows[0]).getByText('Race')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Q')).toBeInTheDocument();
    expect(within(rows[0]).getByText('1,520')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Corrected')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Finished')).toBeInTheDocument();

    await waitFor(() => expect(getFixtureEvents).toHaveBeenCalledWith('s1', { type: undefined, includeSuperseded: false }));
    expect(await screen.findByText(/Session statistics for 20 drivers/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "view this fixture's statistics" }))
      .toHaveAttribute('href', '/statistics?view=fixture&session=s1');
  });

  test('shows what each event recorded, and flags corrections the right way round', async () => {
    renderPage();
    expect(await screen.findByText('P1 · 25 pts')).toBeInTheDocument();
    expect(screen.getByText('Result', { selector: '.log-row span' })).toBeInTheDocument();
    expect(screen.getByText('23.4 s in the pit lane · Lap 17')).toBeInTheDocument();
    expect(screen.getByText('Correction')).toBeInTheDocument();
    // Lap 0 (the grid) isn't a lap anyone would look for, so it isn't shown.
    expect(screen.queryByText(/Lap 0/)).not.toBeInTheDocument();
    expect(screen.queryByText('Ingested')).not.toBeInTheDocument();
  });

  test('says how much of the log is shown and loads the rest on request', async () => {
    renderPage();
    expect(await screen.findByText(/Showing 3 of 1,520 events/)).toBeInTheDocument();

    getFixtureEvents.mockResolvedValueOnce({
      ...eventsResponse,
      events: [{ id: 'e3', eventType: 'flag_event', lapNumber: 30, occurredAt: '2024-03-02T16:00:00.000Z', driverName: null, payload: { flag: 'YELLOW' }, isCorrection: false, superseded: false }],
      page: { total: 1520, nextCursor: null },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('YELLOW flag · Lap 30')).toBeInTheDocument();
    expect(getFixtureEvents).toHaveBeenLastCalledWith('s1', { type: undefined, includeSuperseded: false, cursor: 'e2' });
    expect(screen.getByText(/Showing 4 of 1,520 events/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  test('opens the fixture named in the address, and clicking a fixture updates the address', async () => {
    renderPage('/fixtures?session=s2');
    await waitFor(() => expect(getFixtureEvents).toHaveBeenCalledWith('s2', expect.anything()));
    expect(screen.getByLabelText('Season')).toHaveValue('2023');

    fireEvent.change(screen.getByLabelText('Season'), { target: { value: '2024' } });
    fireEvent.click(screen.getAllByText('Bahrain Grand Prix')[1]);
    await waitFor(() => expect(getFixtureEvents).toHaveBeenLastCalledWith('s1q', expect.anything()));
    expect(screen.getByTestId('location')).toHaveTextContent('/fixtures?session=s1q');
  });

  test('filters the log by event type and can include replaced versions', async () => {
    renderPage();
    await screen.findByText('P1 · 25 pts');
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'pit_stop' } });
    await waitFor(() => expect(getFixtureEvents).toHaveBeenLastCalledWith('s1', { type: 'pit_stop', includeSuperseded: false }));
    fireEvent.click(screen.getByLabelText(/Include versions later corrected/));
    await waitFor(() => expect(getFixtureEvents).toHaveBeenLastCalledWith('s1', { type: 'pit_stop', includeSuperseded: true }));
  });

  test('no longer quotes the assignment brief to visitors', async () => {
    renderPage();
    await screen.findAllByText('Bahrain Grand Prix');
    expect(screen.queryByText(/Why this page|the brief/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Only published data is shown/)).toBeInTheDocument();
  });
});
