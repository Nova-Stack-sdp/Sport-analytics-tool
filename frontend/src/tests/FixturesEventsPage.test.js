import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FixturesEventsPage from '../pages/FixturesEventsPage';
import { getFixtures, getFixtureEvents } from '../api/client';

jest.mock('../api/client');

const fixturesResponse = {
  fixtures: [
    {
      id: 's1',
      meetingName: 'Bahrain Grand Prix',
      circuitName: 'Sakhir',
      country: 'Bahrain',
      season: 2024,
      type: 'Race',
      startTime: '2024-03-02T15:00:00.000Z',
      status: 'finished',
      hasCorrections: false,
    },
    {
      id: 's2',
      meetingName: 'Australian Grand Prix',
      circuitName: 'Albert Park',
      country: 'Australia',
      season: 2023,
      type: 'Q',
      startTime: '2023-03-03T15:00:00.000Z',
      status: 'finished',
      hasCorrections: true,
    },
  ],
};

const eventsResponse = {
  session: { id: 's1', meetingName: 'Bahrain Grand Prix', type: 'Race' },
  derivedStatsCount: 20,
  events: [
    { id: 'e1', eventType: 'classification', lapNumber: null, occurredAt: '2024-03-02T17:00:00.000Z', driverName: 'Max VERSTAPPEN', corrected: false },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <FixturesEventsPage />
    </MemoryRouter>
  );
}

describe('FixturesEventsPage', () => {
  test('lists fixtures and loads the event log for the first one by default', async () => {
    getFixtures.mockResolvedValue(fixturesResponse);
    getFixtureEvents.mockResolvedValue(eventsResponse);

    renderPage();

    await waitFor(() => expect(screen.getByText('Bahrain Grand Prix')).toBeInTheDocument());
    expect(screen.getByText('Australian Grand Prix')).toBeInTheDocument();
    expect(screen.getByText('Corrected')).toBeInTheDocument(); // s2's status pill

    await waitFor(() => expect(getFixtureEvents).toHaveBeenCalledWith('s1'));
    await waitFor(() => expect(screen.getByText('20 stats recomputed', { exact: false })).toBeInTheDocument());
  });

  test('clicking a different fixture loads its own event log', async () => {
    getFixtures.mockResolvedValue(fixturesResponse);
    getFixtureEvents.mockResolvedValue(eventsResponse);

    renderPage();
    await waitFor(() => expect(screen.getByText('Australian Grand Prix')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Australian Grand Prix'));

    await waitFor(() => expect(getFixtureEvents).toHaveBeenLastCalledWith('s2'));
  });
});