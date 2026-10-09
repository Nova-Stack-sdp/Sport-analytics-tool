import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StatisticsPage from '../pages/StatisticsPage';
import { getStatistics } from '../api/client';

jest.mock('../api/client', () => ({ getStatistics: jest.fn() }));

const fixture = {
  view: 'fixture',
  sessionId: 's1',
  availableSessions: [{ id: 's1', label: 'Bahrain Race', season: 2026 }, { id: 's2', label: 'Monaco Race' }],
  rows: [
    { driverId: 'r', name: 'Red Bull Driver', teamId: 't1', teamName: 'Red Bull Racing', teamColor: '#3671C6', teamCode: 'RBR', finalPosition: 1, points: 25, fastestLapMs: 60001, avgLapMs: 61000, totalPitTimeMs: 2034, positionsGained: 2 },
    { driverId: 'o', name: 'Other Driver', teamName: null, finalPosition: null, points: null, fastestLapMs: null, avgLapMs: null, totalPitTimeMs: null, positionsGained: null },
    { driverId: 'm', name: 'Mystery Driver', teamId: null, teamName: 'Mystery Team', teamColor: '#8A8F98', teamCode: null, finalPosition: 3, points: 15, fastestLapMs: 62000, avgLapMs: 63000, totalPitTimeMs: 0, positionsGained: -1 },
  ],
};

function renderPage(path = '/statistics?view=fixture') {
  return render(<MemoryRouter initialEntries={[path]}><StatisticsPage /></MemoryRouter>);
}

describe('StatisticsPage additional states', () => {
  beforeEach(() => jest.clearAllMocks());

  test('formats every fixture column and handles missing teams and codes', async () => {
    getStatistics.mockResolvedValue(fixture);
    renderPage();
    await screen.findByText('Avg lap');

    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('-1')).toBeInTheDocument();
    expect(screen.getByText('2.03s')).toBeInTheDocument();
    expect(screen.getByText('0.00s')).toBeInTheDocument();
    expect(screen.getByText('1:00.001')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(1);
    // A team without an id or code still shows, unlinked, by name.
    expect(screen.getByLabelText('Mystery Team')).toHaveTextContent('Mystery Team');
    expect(screen.getByRole('group', { name: 'Other' })).toBeInTheDocument();
  });

  test('reports request errors and does not update an unmounted request', async () => {
    getStatistics.mockRejectedValueOnce(new Error('service unavailable'));
    renderPage('/statistics');
    expect(await screen.findByText(/Couldn't load the statistics: service unavailable/i)).toBeInTheDocument();

    let resolve;
    getStatistics.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const pending = renderPage('/statistics');
    pending.unmount();
    await act(async () => resolve(fixture));
    expect(getStatistics).toHaveBeenCalledTimes(2);
  });

  test('an unknown view in the address falls back to the season view', async () => {
    getStatistics.mockResolvedValue({ view: 'season', season: null, availableSeasons: [], rows: [] });
    renderPage('/statistics?view=bogus');
    await screen.findByText(/No figures derived yet/);
    expect(getStatistics).toHaveBeenCalledWith({ view: 'season' });
  });
});
