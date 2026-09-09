import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DriversPage from '../pages/DriversPage';
import { getCachedImageUrl, getDrivers } from '../api/client';

jest.mock('../api/client', () => ({
  getCachedImageUrl: jest.fn((source) => `https://cache.test/?source=${encodeURIComponent(source)}`),
  getDrivers: jest.fn(),
}));

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

  test('shows a loading state until the first driver page resolves', () => {
    getDrivers.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText('Loading drivers…')).toBeInTheDocument();
    expect(getDrivers).toHaveBeenCalledWith({ limit: 2, offset: 0 });
  });

  test('renders the initial driver cards with cached photos, number fallbacks, flags, and profile links', async () => {
    getDrivers.mockResolvedValue({ season: 2026, drivers, total: 2, hasMore: false });

    renderPage();

    await waitFor(() => expect(screen.getByText('Max Verstappen')).toBeInTheDocument());

    expect(screen.getByRole('img', { name: 'Max Verstappen' })).toHaveAttribute(
      'src',
      `https://cache.test/?source=${encodeURIComponent(drivers[0].imageUrl)}`
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

  test('prefetches the remaining cards and only reveals them after View more is clicked', async () => {
    const remainingDrivers = [{
      id: 'driver-3',
      name: 'Charles Leclerc',
      number: 16,
      teamName: 'Ferrari',
      teamColor: '#E8002D',
      flag: '🇲🇨',
      imageUrl: 'https://example.test/charles.png',
    }];
    window.requestIdleCallback = jest.fn((callback) => {
      callback();
      return 1;
    });
    window.cancelIdleCallback = jest.fn();
    getDrivers
      .mockResolvedValueOnce({ season: 2026, drivers, total: 3, hasMore: true })
      .mockResolvedValueOnce({ season: 2026, drivers: remainingDrivers, total: 3, hasMore: false });

    renderPage();

    await screen.findByText('Max Verstappen');
    await waitFor(() => expect(getDrivers).toHaveBeenLastCalledWith({ limit: 100, offset: 2 }));
    expect(screen.queryByText('Charles Leclerc')).not.toBeInTheDocument();

    const viewMore = await screen.findByRole('button', { name: 'View more' });
    expect(viewMore).toBeEnabled();
    fireEvent.click(viewMore);

    expect(await screen.findByText('Charles Leclerc')).toBeInTheDocument();
    expect(getCachedImageUrl).toHaveBeenCalledWith(remainingDrivers[0].imageUrl);
  });

  test('falls back from a failed primary headshot to API-Sports, then to the driver number', async () => {
    const driver = {
      ...drivers[0],
      imageUrl: 'https://example.test/openf1.png',
      fallbackImageUrl: 'https://example.test/api-sports.png',
    };
    getDrivers.mockResolvedValue({ season: 2026, drivers: [driver], total: 1, hasMore: false });

    renderPage();

    const image = await screen.findByRole('img', { name: 'Max Verstappen' });
    fireEvent.error(image);
    expect(await screen.findByRole('img', { name: 'Max Verstappen' })).toHaveAttribute(
      'src',
      `https://cache.test/?source=${encodeURIComponent(driver.fallbackImageUrl)}`
    );
    fireEvent.error(screen.getByRole('img', { name: 'Max Verstappen' }));
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Max Verstappen' })).not.toBeInTheDocument());
    expect(screen.getAllByText('1')).toHaveLength(2);
  });

  test('shows the empty state when the API returns no drivers', async () => {
    getDrivers.mockResolvedValue({ season: 2026, drivers: [], total: 0, hasMore: false });

    renderPage();

    expect(await screen.findByText('No drivers available yet.')).toBeInTheDocument();
  });

  test('shows an API error without rendering a driver grid', async () => {
    getDrivers.mockRejectedValue(new Error('Driver feed failed'));

    renderPage();

    expect(await screen.findByText('Driver feed failed')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Max Verstappen/i })).not.toBeInTheDocument();
  });

  test('does not update state after unmounting while the first request is pending', async () => {
    let resolveRequest;
    getDrivers.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    const { unmount } = renderPage();

    unmount();
    await act(async () => {
      resolveRequest({ season: 2026, drivers, total: 2, hasMore: false });
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
