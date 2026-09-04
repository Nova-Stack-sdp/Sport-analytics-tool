import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TeamsPage from '../pages/TeamsPage';
import { getTeams } from '../api/client';

jest.mock('../api/client', () => ({ getTeams: jest.fn() }));

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
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('shows a loading state until the teams API resolves', () => {
    getTeams.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText('Loading teams…')).toBeInTheDocument();
  });

  test('renders ranked team cards, API-Sports logos, fallback initials, and detail links', async () => {
    getTeams.mockResolvedValue({ season: 2026, teams });

    renderPage();

    await waitFor(() => expect(screen.getByText('Red Bull Racing')).toBeInTheDocument());

    expect(screen.queryByText('Loading teams…')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Red Bull Racing' })).toHaveAttribute(
      'src',
      teams[0].logoUrl
    );
    expect(screen.getByText('MR')).toBeInTheDocument();
    expect(screen.getByText('612 pts')).toBeInTheDocument();
    expect(screen.getByText('455 pts')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Red Bull Racing/i })).toHaveAttribute('href', '/team/1');
    expect(screen.getByRole('link', { name: /McLaren Racing/i })).toHaveAttribute('href', '/team/2');
  });

  test('shows the empty state when the API returns no teams', async () => {
    getTeams.mockResolvedValue({ season: 2026, teams: [] });

    renderPage();

    expect(await screen.findByText('No teams available yet.')).toBeInTheDocument();
  });

  test('shows an API error without rendering a team grid', async () => {
    getTeams.mockRejectedValue(new Error('API-Sports is unavailable'));

    renderPage();

    expect(await screen.findByText('API-Sports is unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Red Bull Racing/i })).not.toBeInTheDocument();
  });

  test('does not update state after unmounting while a request is pending', async () => {
    let resolveRequest;
    getTeams.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    const { unmount } = renderPage();

    unmount();
    await act(async () => {
      resolveRequest({ season: 2026, teams });
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
