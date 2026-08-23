import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StatisticsPage from '../pages/StatisticsPage';
import { getStatistics } from '../api/client';

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
});