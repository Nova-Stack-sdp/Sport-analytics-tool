import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DriversPage from '../pages/DriversPage';
import { getDrivers } from '../api/client';

jest.mock('../api/client', () => ({ getDrivers: jest.fn() }));

const drivers = [
  {
    id: 'driver-1',
    name: 'Max Verstappen',
    number: 1,
    teamName: 'Red Bull Racing',
    teamColor: '#3671C6',
    flag: '🇳🇱',
    imageUrl: 'https://example.test/max.png',
  },
  {
    id: 'driver-2',
    name: 'Lando Norris',
    number: 4,
    teamName: 'McLaren Racing',
    teamColor: '#FF8000',
    flag: '🇬🇧',
    imageUrl: null,
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <DriversPage />
    </MemoryRouter>
  );
}

describe('DriversPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('shows a loading state until the drivers API resolves', () => {
    getDrivers.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText('Loading drivers…')).toBeInTheDocument();
  });

  test('renders ranked drivers with API-Sports photos, number fallbacks, flags, and profile links', async () => {
    getDrivers.mockResolvedValue({ season: 2026, drivers });

    renderPage();

    await waitFor(() => expect(screen.getByText('Max Verstappen')).toBeInTheDocument());

    expect(screen.getByRole('img', { name: 'Max Verstappen' })).toHaveAttribute(
      'src',
      drivers[0].imageUrl
    );
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Red Bull Racing')).toBeInTheDocument();
    expect(screen.getByText('McLaren Racing')).toBeInTheDocument();
    expect(screen.getByText('🇳🇱')).toBeInTheDocument();
    expect(screen.getByText('🇬🇧')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Max Verstappen/i })).toHaveAttribute(
      'href',
      '/driver/driver-1'
    );
    expect(screen.getByRole('link', { name: /Lando Norris/i })).toHaveAttribute(
      'href',
      '/driver/driver-2'
    );
  });

  test('shows the empty state when the API returns no drivers', async () => {
    getDrivers.mockResolvedValue({ season: 2026, drivers: [] });

    renderPage();

    expect(await screen.findByText('No drivers available yet.')).toBeInTheDocument();
  });

  test('shows an API error without rendering a driver grid', async () => {
    getDrivers.mockRejectedValue(new Error('Driver feed failed'));

    renderPage();

    expect(await screen.findByText('Driver feed failed')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Max Verstappen/i })).not.toBeInTheDocument();
  });

  test('does not update state after unmounting while a request is pending', async () => {
    let resolveRequest;
    getDrivers.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    const { unmount } = renderPage();

    unmount();
    await act(async () => {
      resolveRequest({ season: 2026, drivers });
    });

    expect(getDrivers).toHaveBeenCalledTimes(1);
  });

  test('does not update state after an unmounted request rejects', async () => {
    let rejectRequest;
    getDrivers.mockReturnValue(new Promise((resolve, reject) => { rejectRequest = reject; }));
    const { unmount } = renderPage();

    unmount();
    await act(async () => {
      rejectRequest(new Error('Late failure'));
    });

    expect(getDrivers).toHaveBeenCalledTimes(1);
  });
});
