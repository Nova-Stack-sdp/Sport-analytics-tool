import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TeamDetailPage from '../pages/TeamDetailPage';
import { getTeam } from '../api/client';

jest.mock('../api/client', () => ({ getTeam: jest.fn() }));

const fullTeam = {
  id: '1',
  name: 'Red Bull Racing',
  color: '#3671C6',
  logoUrl: 'https://example.test/red-bull.png',
  base: 'Milton Keynes, United Kingdom',
  firstTeamEntry: 1997,
  worldChampionships: 6,
  highestRaceFinish: { position: 1, number: 130 },
  polePositions: 111,
  fastestLaps: 100,
  director: 'Laurent Mekies',
  chassis: 'RB22',
  engine: 'Red Bull Ford',
  tyres: 'Pirelli',
  season: 2026,
  seasonStats: { points: 612, wins: 10, reliabilityRate: 0.92 },
  drivers: [
    { id: 'driver-1', name: 'Max Verstappen', number: 1 },
    { id: 'driver-2', name: 'Yuki Tsunoda', number: 22 },
  ],
};

const sparseTeam = {
  id: '2',
  name: 'Minimal Team',
  color: '#CE0D14',
  logoUrl: null,
  base: null,
  firstTeamEntry: null,
  worldChampionships: null,
  highestRaceFinish: null,
  polePositions: null,
  fastestLaps: null,
  director: null,
  chassis: null,
  engine: null,
  season: 2026,
  seasonStats: null,
  drivers: [],
};

function renderPage(id = '1') {
  return render(
    <MemoryRouter initialEntries={[`/team/${id}`]}>
      <Routes>
        <Route path="/team/:id" element={<TeamDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TeamDetailPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('shows a loading state and requests the team identified in the route', () => {
    getTeam.mockReturnValue(new Promise(() => {}));

    renderPage('42');

    expect(screen.getByText('Loading team…')).toBeInTheDocument();
    expect(getTeam).toHaveBeenCalledWith('42');
  });

  test('renders API-Sports identity, local season stats, driver links, facts, and gallery', async () => {
    getTeam.mockResolvedValue(fullTeam);

    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Red Bull Racing' })).toBeInTheDocument());

    expect(screen.getByRole('img', { name: 'Red Bull Racing' })).toHaveAttribute('src', fullTeam.logoUrl);
    expect(screen.getByText('612')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('P1 (130x)')).toBeInTheDocument();
    expect(screen.getByText('Milton Keynes, United Kingdom')).toBeInTheDocument();
    expect(screen.getByText('Laurent Mekies')).toBeInTheDocument();
    expect(screen.getByText('RB22')).toBeInTheDocument();
    expect(screen.getByText('Red Bull Ford')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /1 · Max Verstappen/i })).toHaveAttribute(
      'href',
      '/driver/driver-1'
    );
    expect(screen.getByRole('link', { name: /22 · Yuki Tsunoda/i })).toHaveAttribute(
      'href',
      '/driver/driver-2'
    );
    expect(document.querySelectorAll('.gallery-cell')).toHaveLength(4);
  });

  test('renders all safe fallbacks when optional API-Sports and derived fields are missing', async () => {
    getTeam.mockResolvedValue(sparseTeam);

    renderPage('2');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Minimal Team' })).toBeInTheDocument());

    expect(screen.queryByRole('img', { name: 'Minimal Team' })).not.toBeInTheDocument();
    expect(screen.getByText('an undisclosed location', { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(4);
    expect(screen.getAllByText('0').length).toBeGreaterThan(3);
    expect(screen.queryByRole('link', { name: /·/ })).not.toBeInTheDocument();
  });

  test('shows an API error', async () => {
    getTeam.mockRejectedValue(new Error('Team endpoint unavailable'));

    renderPage();

    expect(await screen.findByText('Team endpoint unavailable')).toBeInTheDocument();
  });

  test('renders nothing after a successful null response', async () => {
    getTeam.mockResolvedValue(null);
    const { container } = renderPage();

    await waitFor(() => expect(getTeam).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  test('does not update state after unmounting while a request is pending', async () => {
    let resolveRequest;
    getTeam.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    const { unmount } = renderPage();

    unmount();
    await act(async () => {
      resolveRequest(fullTeam);
    });

    expect(getTeam).toHaveBeenCalledTimes(1);
  });

  test('does not update state after an unmounted request rejects', async () => {
    let rejectRequest;
    getTeam.mockReturnValue(new Promise((resolve, reject) => { rejectRequest = reject; }));
    const { unmount } = renderPage();

    unmount();
    await act(async () => {
      rejectRequest(new Error('Late failure'));
    });

    expect(getTeam).toHaveBeenCalledTimes(1);
  });
});
