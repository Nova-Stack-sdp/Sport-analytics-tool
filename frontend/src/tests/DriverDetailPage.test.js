import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DriverDetailPage from '../pages/DriverDetailPage';
import { getDriver } from '../api/client';

jest.mock('../api/client', () => ({ getDriver: jest.fn() }));

const fullDriver = {
  id: 'driver-1',
  name: 'Max Verstappen',
  number: 1,
  nationality: 'Dutch',
  flag: '🇳🇱',
  birthdate: '1997-09-30',
  imageUrl: 'https://example.test/max.png',
  teamName: 'Red Bull Racing',
  teamColor: '#3671C6',
  broadcastName: 'M VERSTAPPEN',
  acronym: 'VER',
  season: 2026,
  seasonStats: {
    poles: 3,
    wins: 10,
    starts: 12,
    points: '232.5',
    podiums: 10,
    averageFinish: 1.5,
    highestRaceFinish: { position: 1 },
    dnfCount: 2,
  },
  trackedHistoryStats: {
    starts: 100,
    points: 3553.5,
    wins: 71,
    podiums: 131,
    highestRaceFinish: { position: 1 },
    averageFinish: 2.1,
  },
  results: [
    { sessionId: 's1', meetingName: 'Bahrain GP', type: 'Race', qualified: 1, result: 2, status: 'Finished', laps: 57, gapToLeader: 0, points: 18 },
    { sessionId: 's2', meetingName: 'Saudi Arabian GP', type: 'Sprint', qualified: null, result: null, status: 'DNF', laps: null, gapToLeader: '1.5', points: 0.5 },
    { sessionId: 's3', meetingName: 'Miami GP', type: 'Race', qualified: 3, result: 3, status: 'Finished', laps: 56, gapToLeader: '+2', points: 15 },
  ],
};

const sparseDriver = {
  id: 'driver-2',
  name: 'Fallback Driver',
  number: 99,
  nationality: 'Unknown',
  flag: '🏁',
  birthdate: null,
  imageUrl: null,
  teamName: 'Unknown Team',
  teamColor: '#CE0D14',
  season: 2026,
  seasonStats: { starts: 10, dnfCount: 0 },
  trackedHistoryStats: null,
  results: [],
};

function renderPage(id = 'driver-1') {
  return render(
    <MemoryRouter initialEntries={[`/driver/${id}`]}>
      <Routes>
        <Route path="/driver/:id" element={<DriverDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('DriverDetailPage', () => {
  afterEach(() => jest.clearAllMocks());

  test('shows loading and requests the driver from the route', () => {
    getDriver.mockReturnValue(new Promise(() => {}));
    renderPage('driver-42');
    expect(screen.getByText('Loading driver…')).toBeInTheDocument();
    expect(getDriver).toHaveBeenCalledWith('driver-42');
  });

  test('renders enriched profile, derived totals, and result-table fallback values', async () => {
    getDriver.mockResolvedValue(fullDriver);
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Max Verstappen' })).toBeInTheDocument());
    expect(screen.getByRole('img', { name: 'Max Verstappen' })).toHaveAttribute('src', fullDriver.imageUrl);
    expect(screen.getByText('M VERSTAPPEN · VER')).toBeInTheDocument();
    expect(screen.getByText('🇳🇱 Dutch')).toBeInTheDocument();
    expect(screen.getAllByText('232.5')).toHaveLength(2);
    expect(screen.getByText('17%')).toBeInTheDocument();
    expect(screen.getByText('Bahrain GP · Race')).toBeInTheDocument();
    expect(screen.getByText('Saudi Arabian GP · Sprint')).toBeInTheDocument();
    expect(screen.getByText('Winner')).toBeInTheDocument();
    expect(screen.getByText('+1.5')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getAllByText('P1').length).toBeGreaterThan(1);
    expect(screen.getAllByText('—').length).toBeGreaterThan(1);
    expect(screen.getByText('0.5')).toBeInTheDocument();
  });

  test('renders number portrait and safe fallbacks when optional fields are absent', async () => {
    getDriver.mockResolvedValue(sparseDriver);
    renderPage('driver-2');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Fallback Driver' })).toBeInTheDocument());
    expect(screen.queryByRole('img', { name: 'Fallback Driver' })).not.toBeInTheDocument();
    expect(screen.getAllByText('99')).toHaveLength(2);
    expect(screen.getByText('🏁 Unknown')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(document.querySelector('table.results')).not.toBeInTheDocument();
  });

  test('shows an API error and nothing for a successful null response', async () => {
    getDriver.mockRejectedValueOnce(new Error('Driver endpoint unavailable'));
    renderPage();
    expect(await screen.findByText('Driver endpoint unavailable')).toBeInTheDocument();

    getDriver.mockResolvedValueOnce(null);
    const { container } = renderPage('driver-2');
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  test('does not update state after an unmounted request settles', async () => {
    let resolveRequest;
    let rejectRequest;
    getDriver
      .mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve; }))
      .mockReturnValueOnce(new Promise((resolve, reject) => { rejectRequest = reject; }));
    const first = renderPage();
    first.unmount();
    await act(async () => resolveRequest(fullDriver));

    const second = renderPage('driver-2');
    second.unmount();
    await act(async () => rejectRequest(new Error('Late failure')));
    expect(getDriver).toHaveBeenCalledTimes(2);
  });
});
