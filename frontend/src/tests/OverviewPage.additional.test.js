import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OverviewPage from '../pages/OverviewPage';
import { getOverview } from '../api/client';

jest.mock('../api/client', () => ({ getOverview: jest.fn() }));

const full = {
  stats: { fixturesTracked: 1, seasonsCovered: 4, pendingSubmissions: 0, lastDataUpdate: null },
  season: 2026,
  latestSession: { id: 'live-1', meetingName: 'Live GP', circuitName: 'Test Circuit', country: 'Testland', type: 'Race', status: 'live', startTime: '2026-01-01T10:00:00Z' },
  recentEvents: [{ id: 'e1', occurredAt: '2026-01-01T10:01:00Z', eventType: 'lap_completed', lapNumber: 3 }, { id: 'e2', occurredAt: null, eventType: 'flag', lapNumber: null }],
  leaderboard: [{ driverId: 'd1', name: 'Leader', wins: 1, points: 25 }, { driverId: 'd2', name: 'Second', wins: 0, points: 18 }],
  teamComparison: [{ teamId: 'a', name: 'A', points: 60, wins: 2, reliabilityRate: 0.95 }, { teamId: 'b', name: 'B', points: 40, wins: 1, reliabilityRate: null }],
  recentUpdates: [
    { id: 'a', source: 'manual_upload', status: 'accepted', publishedAt: '2026-01-01T11:00:00Z', session: null, eventsAdded: null, eventsCorrected: null },
    { id: 'b', source: 'something_new', status: 'partially_accepted', publishedAt: null, session: { id: 's2', type: 'FP1', meetingName: 'Test GP' }, eventsAdded: 0, eventsCorrected: 0 },
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

    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('live')).toHaveClass('live-blink');
    expect(screen.getByText('Lap 3')).toBeInTheDocument();
    expect(screen.getByText('flag')).toBeInTheDocument();
    expect(screen.getByText('A · 60%')).toBeInTheDocument();
    expect(screen.getByText('B · 40%')).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument();
    expect(screen.getByText('Developer upload')).toBeInTheDocument();
    expect(screen.getByText('something new')).toBeInTheDocument();
    expect(screen.getByText('+0')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open this fixture' })).toHaveAttribute('href', '/fixtures?session=live-1');
  });

  test('renders no-session and no-derived-data fallbacks', async () => {
    getOverview.mockResolvedValue({
      stats: { fixturesTracked: 0, seasonsCovered: 0, pendingSubmissions: 1, lastDataUpdate: null },
      season: null,
      latestSession: null,
      recentEvents: [],
      leaderboard: [],
      teamComparison: [{ name: 'A', points: 0, wins: 0 }, { name: 'B', points: 0, wins: 0 }],
      recentUpdates: [],
    });
    renderPage();
    await screen.findByText('No sessions yet');

    expect(screen.getByText(/No sessions have been synced yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No driver stats derived yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No data has been published yet/i)).toBeInTheDocument();
    expect(screen.getByText('A · no points yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse fixtures' })).toHaveAttribute('href', '/fixtures');
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
