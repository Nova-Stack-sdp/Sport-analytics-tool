import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StatisticsPage from '../pages/StatisticsPage';
import { getStatistics, listPublicCode, publicCodeUrl } from '../api/client';

jest.mock('../api/client');

const seasonResponse = {
  view: 'season',
  season: 2024,
  availableSeasons: [2024, 2023],
  rows: [
    {
      driverId: 'd1',
      name: 'Max VERSTAPPEN',
      teamName: 'Red Bull Racing',
      points: 26,
      wins: 1,
      podiums: 1,
      fastestLapMs: 78402,
      fixturesCount: 1,
    },
  ],
};

const careerResponse = {
  view: 'career',
  rows: [
    {
      driverId: 'd1',
      name: 'Max VERSTAPPEN',
      teamName: 'Red Bull Racing',
      points: 46,
      wins: 2,
      podiums: 2,
      seasonsCount: 2,
      fastestLapMs: 78402,
      fixturesCount: 2,
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <StatisticsPage />
    </MemoryRouter>
  );
}

describe('StatisticsPage', () => {
  beforeEach(() => {
    listPublicCode.mockResolvedValue({ data: [] });
    publicCodeUrl.mockImplementation((endpoint) => `https://api.example.com${endpoint}`);
  });

  test('shows season data by default, with a season selector', async () => {
    getStatistics.mockResolvedValue(seasonResponse);

    renderPage();

    await waitFor(() => expect(screen.getByText('Max VERSTAPPEN')).toBeInTheDocument());
    expect(screen.getByText('1:18.402')).toBeInTheDocument();
    expect(getStatistics).toHaveBeenCalledWith(expect.objectContaining({ view: 'season' }));
  });

  test('switching to the Career tab fetches the career view', async () => {
    getStatistics.mockResolvedValueOnce(seasonResponse).mockResolvedValueOnce(seasonResponse).mockResolvedValueOnce(careerResponse);

    renderPage();
    await waitFor(() => expect(screen.getByText('Max VERSTAPPEN')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Career'));

    await waitFor(() =>
      expect(getStatistics).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'career' }))
    );
  });

  test('shows an empty state when a view has no derived data yet', async () => {
    getStatistics.mockResolvedValue({ view: 'career', rows: [] });

    renderPage();
    fireEvent.click(screen.getByText('Career'));

    await waitFor(() =>
      expect(screen.getByText(/No data derived yet/i)).toBeInTheDocument()
    );
  });

  test('lists public scripts with their URLs and anonymous attribution even when statistics fail', async () => {
    getStatistics.mockRejectedValue(new Error('Statistics unavailable'));
    listPublicCode.mockResolvedValue({ data: [
      { slug: 'pit-loss', name: 'Average pit loss', description: 'Mean time lost per stop.', endpoint: '/api/v1/code/pit-loss', author: 'Private name' },
      { slug: 'lap-pace', name: 'Lap pace', description: 'Average lap pace.', endpoint: '/api/v1/code/lap-pace' },
    ] });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Average pit loss' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lap pace' })).toBeInTheDocument();
    expect(screen.getByText('Mean time lost per stop.')).toBeInTheDocument();
    expect(screen.getByText('Average lap pace.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://api.example.com/api/v1/code/pit-loss' }))
      .toHaveAttribute('href', 'https://api.example.com/api/v1/code/pit-loss');
    expect(screen.getAllByText('Author: Anonymous (Privacy Protected)')).toHaveLength(2);
    expect(screen.queryByText('Private name')).not.toBeInTheDocument();
    expect(listPublicCode).toHaveBeenCalledWith();
  });

  test('shows loading and empty states for approved scripts', async () => {
    getStatistics.mockResolvedValue({ rows: [] });
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading approved scripts');
    expect(await screen.findByText('No approved scripts are available yet.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('keeps statistics visible when the public scripts request fails', async () => {
    getStatistics.mockResolvedValue(seasonResponse);
    listPublicCode.mockRejectedValue(new Error('Service unavailable'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load approved scripts');
    expect(await screen.findByText('Max VERSTAPPEN')).toBeInTheDocument();
    expect(screen.queryByText('No approved scripts are available yet.')).not.toBeInTheDocument();
  });
});
