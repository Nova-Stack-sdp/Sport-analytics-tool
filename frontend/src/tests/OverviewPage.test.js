import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OverviewPage from '../pages/OverviewPage';
import { getOverview } from '../api/client';

jest.mock('../api/client');

const sampleResponse = {
  stats: { fixturesTracked: 12, sessionsFinished: 8, pendingSubmissions: 2, eventsLast24h: 431 },
  season: 2026,
  latestSession: {
    id: 's1',
    type: 'Race',
    status: 'finished',
    startTime: '2026-05-04T14:00:00.000Z',
    meetingName: 'Miami Grand Prix',
    circuitName: 'Miami International Autodrome',
    country: 'USA',
  },
  recentEvents: [
    { id: 'e1', eventType: 'lap_completed', lapNumber: 42, occurredAt: '2026-05-04T15:12:00.000Z' },
  ],
  leaderboard: [
    { driverId: 'd1', name: 'Max Verstappen', driverNumber: 1, points: 186, wins: 5, podiums: 8 },
  ],
  teamComparison: [
    { teamId: 't1', name: 'Red Bull Racing', points: 286, wins: 6, reliabilityRate: 0.94 },
    { teamId: 't2', name: 'Mercedes', points: 208, wins: 2, reliabilityRate: 0.88 },
  ],
  submissionQueue: [
    { id: 'sub1', source: 'openf1_sync', status: 'pending', submittedAt: '2026-05-04T16:00:00.000Z', sessionId: 's1' },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <OverviewPage />
    </MemoryRouter>
  );
}

describe('OverviewPage', () => {
  test('shows real data from the backend once it loads', async () => {
    getOverview.mockResolvedValue(sampleResponse);

    renderPage();

    expect(screen.getByText(/Loading overview/i)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('Miami Grand Prix')).toBeInTheDocument());

    expect(screen.getByText('12')).toBeInTheDocument(); // fixtures tracked
    expect(screen.getByText('Max Verstappen')).toBeInTheDocument();
    expect(screen.getByText('Red Bull Racing', { exact: false })).toBeInTheDocument();
  });

  test('shows an error message if the backend request fails', async () => {
    getOverview.mockRejectedValue(new Error('Failed to fetch'));

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/Couldn't reach the backend/i)).toBeInTheDocument()
    );
  });
});