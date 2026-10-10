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
  test.each([
    [0.8846153846, 0.8461538462, '88.5%', '84.6%'],
    [0, 1, '0.0%', '100.0%'],
    [null, undefined, '—', '—'],
  ])('formats reliability values %s and %s', async (a, b, expectedA, expectedB) => {
    getOverview.mockResolvedValue({ ...sampleResponse, teamComparison: [
      { ...sampleResponse.teamComparison[0], reliabilityRate: a },
      { ...sampleResponse.teamComparison[1], reliabilityRate: b },
    ] });
    renderPage();
    const label = await screen.findByText('Reliability rate');
    expect(Array.from(label.parentElement.querySelectorAll('.metric-vals span'), node => node.textContent)).toEqual([expectedA, expectedB]);
  });

  test('renders the empty session message outside the event-column grid', async () => {
    getOverview.mockResolvedValue({ ...sampleResponse, recentEvents: [] });
    renderPage();
    const message = await screen.findByText('No events recorded for this session yet.');
    expect(message).toHaveClass('overview-events-empty');
    expect(message.closest('.log-row')).toBeNull();
    expect(message.parentElement).toHaveClass('log-ticker');
  });

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
