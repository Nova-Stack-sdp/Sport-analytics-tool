import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OverviewPage from '../pages/OverviewPage';
import { getOverview } from '../api/client';

jest.mock('../api/client');

const sampleResponse = {
  stats: { fixturesTracked: 12, seasonsCovered: 3, pendingSubmissions: 2, lastDataUpdate: '2026-05-05T09:00:00.000Z' },
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
    { id: 'e1', eventType: 'lap_completed', lapNumber: 42, occurredAt: '2026-05-04T15:12:00.000Z', driverName: 'Max Verstappen' },
  ],
  leaderboard: [
    { driverId: 'd1', name: 'Max Verstappen', driverNumber: 1, points: 186, wins: 5, podiums: 8 },
  ],
  teamComparison: [
    { teamId: 't1', name: 'Red Bull Racing', points: 286, wins: 6, reliabilityRate: 0.94 },
    { teamId: 't2', name: 'Mercedes', points: 208, wins: 2, reliabilityRate: 0.88 },
  ],
  recentUpdates: [
    {
      id: 'sub1', source: 'openf1_sync', status: 'accepted', publishedAt: '2026-05-05T09:00:00.000Z',
      session: { id: 's1', type: 'Race', meetingName: 'Miami Grand Prix' }, eventsAdded: 1520, eventsCorrected: 3,
    },
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
    expect(screen.getByText('3')).toBeInTheDocument(); // seasons covered
    expect(screen.getAllByText('Max Verstappen').length).toBeGreaterThan(0);
    expect(screen.getByText('Red Bull Racing', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Lap completed')).toBeInTheDocument();
    expect(screen.getByText('Max Verstappen · Lap 42')).toBeInTheDocument();
    expect(screen.getByText('94.0%')).toBeInTheDocument();
    expect(screen.getByText('88.0%')).toBeInTheDocument();
  });

  test('shows an error message if the backend request fails', async () => {
    getOverview.mockRejectedValue(new Error('Failed to fetch'));

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/Couldn't load the overview/i)).toBeInTheDocument()
    );
  });

  test('links the latest session and each data update to its fixture', async () => {
    getOverview.mockResolvedValue(sampleResponse);
    renderPage();
    await screen.findByText('Miami Grand Prix');
    expect(screen.getByRole('link', { name: 'Open this fixture' })).toHaveAttribute('href', '/fixtures?session=s1');
    expect(screen.getByRole('link', { name: "View constructors' standings" })).toHaveAttribute('href', '/statistics?view=constructors');
    expect(screen.getByRole('link', { name: 'Miami Grand Prix · Race' })).toHaveAttribute('href', '/fixtures?session=s1');
    expect(screen.getByText('OpenF1 sync')).toBeInTheDocument();
    expect(screen.getByText('+1,520 (3 corrected)')).toBeInTheDocument();
  });

  test('shows nothing developer-only to public visitors', async () => {
    getOverview.mockResolvedValue(sampleResponse);
    renderPage();
    await screen.findByText('Miami Grand Prix');
    expect(screen.queryByText(/REACT_APP_API_URL|sync job|Submission queue/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open submissions/i })).not.toBeInTheDocument();
  });
});
