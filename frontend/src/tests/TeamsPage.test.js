import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TeamsPage from '../pages/TeamsPage';
import { getCachedImageUrl, getTeams } from '../api/client';

jest.mock('../api/client', () => ({
  getCachedImageUrl: jest.fn((source) => `https://cache.test/?source=${encodeURIComponent(source)}`),
  getTeams: jest.fn(),
}));

const teams = [
  {
    id: '1',
    name: 'Red Bull Racing',
    color: '#3671C6',
    logoUrl: 'https://example.test/red-bull.png',
    initials: 'RB',
    points: 612,
  },
  {
    id: '2',
    name: 'McLaren Racing',
    color: '#FF8000',
    logoUrl: null,
    initials: 'MR',
    points: 455,
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <TeamsPage />
    </MemoryRouter>
  );
}

describe('TeamsPage', () => {
  const originalRequestIdleCallback = window.requestIdleCallback;
  const originalCancelIdleCallback = window.cancelIdleCallback;

  beforeEach(() => {
    getCachedImageUrl.mockImplementation((source) => `https://cache.test/?source=${encodeURIComponent(source)}`);
    window.requestIdleCallback = undefined;
    window.cancelIdleCallback = undefined;
  });

  afterEach(() => {
    jest.clearAllMocks();
    window.requestIdleCallback = originalRequestIdleCallback;
    window.cancelIdleCallback = originalCancelIdleCallback;
  });

  test('shows a loading state until the first team page resolves', () => {
    getTeams.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText('Loading teams…')).toBeInTheDocument();
    expect(getTeams).toHaveBeenCalledWith({ limit: 2, offset: 0 });
  });

  test('renders the initial team cards with cached logos, fallback initials, and detail links', async () => {
    getTeams.mockResolvedValue({ season: 2026, teams, total: 2, hasMore: false });

    renderPage();

    await waitFor(() => expect(screen.getByText('Red Bull Racing')).toBeInTheDocument());

    expect(screen.queryByText('Loading teams…')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Red Bull Racing' })).toHaveAttribute(
      'src',
      `https://cache.test/?source=${encodeURIComponent(teams[0].logoUrl)}`
    );
    expect(screen.getByText('MR')).toBeInTheDocument();
    expect(screen.getByText('612 pts')).toBeInTheDocument();
    expect(screen.getByText('455 pts')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Red Bull Racing/i })).toHaveAttribute('href', '/team/1');
    expect(screen.getByRole('link', { name: /McLaren Racing/i })).toHaveAttribute('href', '/team/2');
  });

  test('prefetches remaining team cards and reveals them when View more is clicked', async () => {
    const remainingTeams = [{
      id: '3',
      name: 'Scuderia Ferrari',
      color: '#E8002D',
      logoUrl: 'https://example.test/ferrari.png',
      initials: 'SF',
      points: 400,
    }];
    window.requestIdleCallback = jest.fn((callback) => {
      callback();
      return 1;
    });
    window.cancelIdleCallback = jest.fn();
    getTeams
      .mockResolvedValueOnce({ season: 2026, teams, total: 3, hasMore: true })
      .mockResolvedValueOnce({ season: 2026, teams: remainingTeams, total: 3, hasMore: false });

    renderPage();

    await screen.findByText('Red Bull Racing');
    await waitFor(() => expect(getTeams).toHaveBeenLastCalledWith({ limit: 100, offset: 2 }));
    expect(screen.queryByText('Scuderia Ferrari')).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'View more' }));

    expect(await screen.findByText('Scuderia Ferrari')).toBeInTheDocument();
    expect(getCachedImageUrl).toHaveBeenCalledWith(remainingTeams[0].logoUrl);
  });

  test('falls back to initials when a cached team logo fails', async () => {
    getTeams.mockResolvedValue({ season: 2026, teams: [teams[0]], total: 1, hasMore: false });

    renderPage();

    fireEvent.error(await screen.findByRole('img', { name: 'Red Bull Racing' }));
    expect(await screen.findByText('RB')).toBeInTheDocument();
  });

  test('shows the empty state when the API returns no teams', async () => {
    getTeams.mockResolvedValue({ season: 2026, teams: [], total: 0, hasMore: false });

    renderPage();

    expect(await screen.findByText('No teams available yet.')).toBeInTheDocument();
  });

  test('shows an API error without rendering a team grid', async () => {
    getTeams.mockRejectedValue(new Error('API-Sports is unavailable'));

    renderPage();

    expect(await screen.findByText('API-Sports is unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Red Bull Racing/i })).not.toBeInTheDocument();
  });

  test('does not update state after unmounting while the first request is pending', async () => {
    let resolveRequest;
    getTeams.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    const { unmount } = renderPage();

    unmount();
    await act(async () => {
      resolveRequest({ season: 2026, teams, total: 2, hasMore: false });
    });

    expect(getTeams).toHaveBeenCalledTimes(1);
  });

  test('does not update state after an unmounted request rejects', async () => {
    let rejectRequest;
    getTeams.mockReturnValue(new Promise((resolve, reject) => { rejectRequest = reject; }));
    const { unmount } = renderPage();

    unmount();
    await act(async () => {
      rejectRequest(new Error('Late failure'));
    });

    expect(getTeams).toHaveBeenCalledTimes(1);
  });
});
