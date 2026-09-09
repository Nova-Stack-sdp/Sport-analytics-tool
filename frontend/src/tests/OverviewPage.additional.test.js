import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OverviewPage from '../pages/OverviewPage';
import { getOverview } from '../api/client';

jest.mock('../api/client', () => ({ getOverview: jest.fn() }));

const full = {
  stats: { fixturesTracked: 1, eventsLast24h: 12345, pendingSubmissions: 0, sessionsFinished: 2 },
  season: 2026,
  latestSession: { meetingName: 'Live GP', circuitName: 'Test Circuit', country: 'Testland', type: 'Race', status: 'live', startTime: '2026-01-01T10:00:00Z' },
  recentEvents: [{ id: 'e1', occurredAt: '2026-01-01T10:01:00Z', eventType: 'lap_completed', lapNumber: 3 }, { id: 'e2', occurredAt: null, eventType: 'flag', lapNumber: null }],
  leaderboard: [{ driverId: 'd1', name: 'Leader', wins: 1, points: 25 }, { driverId: 'd2', name: 'Second', wins: 0, points: 18 }],
  teamComparison: [{ teamId: 'a', name: 'A', points: 60, wins: 2, reliabilityRate: 0.95 }, { teamId: 'b', name: 'B', points: 40, wins: 1, reliabilityRate: null }],
  submissionQueue: [
    { id: 'a', source: 'one', submittedAt: '2026-01-01T11:00:00Z', status: 'accepted' },
    { id: 'b', source: 'two', submittedAt: null, status: 'rejected' },
    { id: 'c', source: 'three', submittedAt: '2026-01-01T12:00:00Z', status: 'partially_accepted' },
    { id: 'd', source: 'four', submittedAt: '2026-01-01T13:00:00Z', status: 'unexpected' },
  ],
};

function renderPage() {
  return render(<MemoryRouter><OverviewPage /></MemoryRouter>);
}

describe('OverviewPage additional states', () => {
  beforeEach(() => jest.clearAllMocks());

  test('renders all dashboard data, status pills, and empty nested event state', async () => {
    getOverview.mockResolvedValue(full);
    renderPage();
    await screen.findByText('Live GP');

    expect(screen.getByText('12,345')).toBeInTheDocument();
    expect(screen.getByText('live')).toHaveClass('live-blink');
    expect(screen.getByText('Lap 3')).toBeInTheDocument();
    expect(screen.getByText('A · 60%')).toBeInTheDocument();
    expect(screen.getByText('B · 40%')).toBeInTheDocument();
    expect(screen.getAllByText('accepted').length).toBeGreaterThan(0);
    expect(screen.getByText('rejected')).toBeInTheDocument();
    expect(screen.getByText('partially_accepted')).toBeInTheDocument();
    expect(screen.getByText('unexpected')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open fixture' })).toHaveAttribute('href', '/fixtures');
  });

  test('renders no-session and no-derived-data fallbacks', async () => {
    getOverview.mockResolvedValue({
      stats: { fixturesTracked: 0, eventsLast24h: 0, pendingSubmissions: 1, sessionsFinished: 0 },
      season: null,
      latestSession: null,
      recentEvents: [],
      leaderboard: [],
      teamComparison: [{ name: 'A', points: 0, wins: 0 }, { name: 'B', points: 0, wins: 0 }],
      submissionQueue: [],
    });
    renderPage();
    await screen.findByText('No sessions yet');

    expect(screen.getByText(/Run the OpenF1 sync job/i)).toBeInTheDocument();
    expect(screen.getByText(/No driver stats derived yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No submissions yet/i)).toBeInTheDocument();
    expect(screen.getByText('A · %')).toBeInTheDocument();
  });

  test('uses a neutral pill for scheduled sessions', async () => {
    getOverview.mockResolvedValue({ ...full, latestSession: { ...full.latestSession, status: 'scheduled' } });
    renderPage();
    expect(await screen.findByText('scheduled')).toHaveClass('pill-blue');
  });

  test('shows errors and ignores late request results after unmount', async () => {
    getOverview.mockRejectedValueOnce(new Error('overview unavailable'));
    renderPage();
    expect(await screen.findByText(/overview unavailable/i)).toBeInTheDocument();

    let resolve;
    getOverview.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const pending = renderPage();
    pending.unmount();
    await act(async () => resolve(full));
    expect(getOverview).toHaveBeenCalledTimes(2);
  });
});
