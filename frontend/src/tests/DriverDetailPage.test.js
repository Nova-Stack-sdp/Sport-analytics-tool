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
  grandsPrixEntered: 244,
  worldChampionships: 4,
  careerPoints: '3553.5',
  podiums: 131,
  highestRaceFinish: { position: 1, number: 71 },
  highestGridPosition: 1,
  season: 2026,
  seasonStats: { points: 232, podiums: 10, dnfCount: 2, wins: 10 },
  results: [
    { sessionId: 's1', meetingName: 'Bahrain GP', type: 'Race', qualified: 1, result: 2, dnf: true, fastestLap: false, points: 18 },
    { sessionId: 's2', meetingName: 'Saudi Arabian GP', type: 'Race', qualified: null, result: null, dnf: false, fastestLap: true, points: 0 },
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
  grandsPrixEntered: 0,
  worldChampionships: 0,
  careerPoints: '0',
  podiums: 0,
  highestRaceFinish: null,
  highestGridPosition: null,
  season: 2026,
  seasonStats: null,
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
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('shows a loading state and requests the driver identified in the route', () => {
    getDriver.mockReturnValue(new Promise(() => {}));

    renderPage('driver-42');

    expect(screen.getByText('Loading driver…')).toBeInTheDocument();
    expect(getDriver).toHaveBeenCalledWith('driver-42');
  });

  test('renders API-Sports profile data, local stats, and all result table branches', async () => {
    getDriver.mockResolvedValue(fullDriver);

    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Max Verstappen' })).toBeInTheDocument());

    expect(screen.getByRole('img', { name: 'Max Verstappen' })).toHaveAttribute('src', fullDriver.imageUrl);
    expect(screen.getByText('🇳🇱 Dutch')).toBeInTheDocument();
    expect(screen.getByText('1997-09-30')).toBeInTheDocument();
    expect(screen.getByText('71')).toBeInTheDocument();
    expect(screen.getAllByText('3553.5')).toHaveLength(2);
    expect(screen.getByText('1%')).toBeInTheDocument();
    expect(screen.getByText('Bahrain GP · Race')).toBeInTheDocument();
    expect(screen.getByText('Saudi Arabian GP · Race')).toBeInTheDocument();
    expect(screen.getByText('1th')).toBeInTheDocument();
    expect(screen.getByText('2th')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Yes')).toHaveLength(2);
  });

  test('renders safe fallback values and number portrait when optional fields are missing', async () => {
    getDriver.mockResolvedValue(sparseDriver);

    renderPage('driver-2');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Fallback Driver' })).toBeInTheDocument());

    expect(screen.queryByRole('img', { name: 'Fallback Driver' })).not.toBeInTheDocument();
    expect(screen.getAllByText('99')).toHaveLength(2);
    expect(screen.getByText('🏁 Unknown')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(2);
    expect(document.querySelector('table.results')).not.toBeInTheDocument();
  });

  test('shows a pole-count fallback when the highest-grid condition is met without finish data', async () => {
    getDriver.mockResolvedValue({ ...sparseDriver, highestGridPosition: 1 });

    renderPage('driver-2');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Fallback Driver' })).toBeInTheDocument());
    expect(screen.getByText('Poles').parentElement).toHaveTextContent('—');
  });

  test('shows an API error', async () => {
    getDriver.mockRejectedValue(new Error('Driver endpoint unavailable'));

    renderPage();

    expect(await screen.findByText('Driver endpoint unavailable')).toBeInTheDocument();
  });

  test('renders nothing after a successful null response', async () => {
    getDriver.mockResolvedValue(null);
    const { container } = renderPage();

    await waitFor(() => expect(getDriver).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  test('does not update state after unmounting while a request is pending', async () => {
    let resolveRequest;
    getDriver.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    const { unmount } = renderPage();

    unmount();
    await act(async () => {
      resolveRequest(fullDriver);
    });

    expect(getDriver).toHaveBeenCalledTimes(1);
  });

  test('does not update state after an unmounted request rejects', async () => {
    let rejectRequest;
    getDriver.mockReturnValue(new Promise((resolve, reject) => { rejectRequest = reject; }));
    const { unmount } = renderPage();

    unmount();
    await act(async () => {
      rejectRequest(new Error('Late failure'));
    });

    expect(getDriver).toHaveBeenCalledTimes(1);
  });
});
