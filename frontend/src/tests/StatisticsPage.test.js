import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import StatisticsPage from '../pages/StatisticsPage';
import { getStatistics } from '../api/client';

jest.mock('../api/client');

const seasonResponse = {
  view: 'season',
  season: 2024,
  availableSeasons: [2024, 2023],
  rows: [
    {
      driverId: 'd1', name: 'Max VERSTAPPEN', teamId: 't1', teamName: 'Red Bull Racing', teamColor: '#3671C6', teamCode: 'RBR',
      points: 26, wins: 1, podiums: 1, fastestLapMs: 78402, racesCount: 1,
    },
    {
      driverId: 'd2', name: 'Lando NORRIS', teamId: 't2', teamName: 'McLaren', teamColor: '#FF8000', teamCode: 'MCL',
      points: 18.5, wins: 0, podiums: 1, fastestLapMs: null, racesCount: 2,
    },
  ],
};

const careerResponse = {
  view: 'career',
  rows: [
    {
      driverId: 'd1', name: 'Max VERSTAPPEN', teamId: 't1', teamName: 'Red Bull Racing', teamColor: '#3671C6', teamCode: 'RBR',
      points: 46, wins: 2, podiums: 2, seasonsCount: 2, fastestLapMs: 78402, racesCount: 2,
    },
  ],
};

const constructorsResponse = {
  view: 'constructors',
  season: 2024,
  availableSeasons: [2024, 2023],
  rows: [
    { teamId: 't2', teamName: 'McLaren', teamColor: '#FF8000', teamCode: 'MCL', name: 'McLaren', points: 600, wins: 6, reliabilityRate: 0.9583 },
  ],
};

const fixtureResponse = {
  view: 'fixture',
  sessionId: 's1',
  sessionLabel: 'Bahrain Grand Prix 2024 · Race',
  availableSessions: [
    { id: 's1', label: 'Bahrain Grand Prix 2024 · Race', season: 2024, type: 'Race' },
    { id: 's0', label: 'Abu Dhabi Grand Prix 2023 · Race', season: 2023, type: 'Race' },
  ],
  rows: [
    {
      driverId: 'd1', name: 'Max VERSTAPPEN', teamId: 't1', teamName: 'Red Bull Racing', teamColor: '#3671C6', teamCode: 'RBR',
      finalPosition: 1, points: 26, fastestLapMs: 78402, avgLapMs: 80000, totalPitTimeMs: 2200, positionsGained: 0,
    },
  ],
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

function renderPage(path = '/statistics') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/statistics" element={<><StatisticsPage /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>
  );
}

function respondByView() {
  getStatistics.mockImplementation(({ view }) => Promise.resolve({
    season: seasonResponse, career: careerResponse, constructors: constructorsResponse, fixture: fixtureResponse,
  }[view]));
}

beforeEach(() => {
  jest.clearAllMocks();
  respondByView();
});

describe('StatisticsPage', () => {
  test('shows the season standings by default, once, with wins, podiums and races', async () => {
    renderPage();

    expect(await screen.findByRole('link', { name: 'Max VERSTAPPEN' })).toHaveAttribute('href', '/driver/d1');
    expect(screen.getByText('1:18.402')).toBeInTheDocument();
    expect(screen.getByText('18.5')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Races' })).toBeInTheDocument();
    expect(getStatistics).toHaveBeenCalledTimes(1);
    expect(getStatistics).toHaveBeenCalledWith({ view: 'season' });
  });

  test('colours every team from the API and links to the team page', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Max VERSTAPPEN' });
    const mclaren = screen.getAllByLabelText('McLaren').find((el) => el.classList.contains('team-tag'));
    expect(mclaren).toHaveTextContent('MCL');
    expect(mclaren).toHaveStyle({ background: '#FF8000' });
    expect(screen.getAllByRole('link', { name: 'McLaren' })[0]).toHaveAttribute('href', '/team/t2');
  });

  test('switching tabs fetches that view and records it in the address', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Max VERSTAPPEN' });

    fireEvent.click(screen.getByRole('tab', { name: 'Career' }));
    await waitFor(() => expect(getStatistics).toHaveBeenLastCalledWith({ view: 'career' }));
    expect(await screen.findByRole('columnheader', { name: 'Seasons' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('view=career');
  });

  test('the Constructors tab shows the team standings with reliability as a percentage', async () => {
    renderPage('/statistics?view=constructors');
    expect(await screen.findByText('96%')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'McLaren' });
    expect(links).toHaveLength(2); // the colour tag and the name
    links.forEach((link) => expect(link).toHaveAttribute('href', '/team/t2'));
    expect(getStatistics).toHaveBeenCalledWith({ view: 'constructors' });
  });

  test('opens the fixture named in the address and links to its event log', async () => {
    renderPage('/statistics?view=fixture&session=s1');
    await waitFor(() => expect(getStatistics).toHaveBeenCalledWith({ view: 'fixture', sessionId: 's1' }));
    expect(await screen.findByRole('link', { name: 'See the events behind these figures' }))
      .toHaveAttribute('href', '/fixtures?session=s1');
    expect(screen.getByRole('group', { name: '2023' })).toBeInTheDocument();
  });

  test('changing the season updates the address and refetches', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Max VERSTAPPEN' });
    fireEvent.change(screen.getByLabelText('Season'), { target: { value: '2023' } });
    await waitFor(() => expect(getStatistics).toHaveBeenLastCalledWith({ view: 'season', season: 2023 }));
    expect(screen.getByTestId('location')).toHaveTextContent('season=2023');
  });

  test('no longer quotes the brief or promises links that do not exist', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Max VERSTAPPEN' });
    expect(screen.queryByText(/Why this page|intermediate tier|competition-wide/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Every figure links back/i)).not.toBeInTheDocument();
  });

  test('shows an empty state when a view has no derived data yet', async () => {
    getStatistics.mockResolvedValue({ view: 'career', rows: [] });
    renderPage('/statistics?view=career');
    expect(await screen.findByText(/No figures derived yet/i)).toBeInTheDocument();
  });
});
