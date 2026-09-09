import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StatisticsPage from '../pages/StatisticsPage';
import { getStatistics } from '../api/client';

jest.mock('../api/client', () => ({ getStatistics: jest.fn() }));

const season = {
  view: 'season',
  season: 2026,
  availableSeasons: [2026, 2025],
  rows: [
    { driverId: 'r', name: 'Red Bull Driver', teamName: 'Red Bull Racing', points: 25, fastestLapMs: 60001, fixturesCount: 1 },
    { driverId: 'm', name: 'Mercedes Driver', teamName: 'Mercedes', points: 18, fastestLapMs: null, fixturesCount: 2 },
    { driverId: 'f', name: 'Ferrari Driver', teamName: 'Ferrari', points: 15, fastestLapMs: 0, fixturesCount: 3 },
    { driverId: 'o', name: 'Other Driver', teamName: 'McLaren', points: 12, fastestLapMs: 98765, fixturesCount: 4 },
    { driverId: 'n', name: 'No Team Driver', teamName: null, points: 0, fastestLapMs: null, fixturesCount: 5 },
  ],
};

const fixture = {
  view: 'fixture',
  sessionId: 's1',
  availableSessions: [{ id: 's1', label: 'Bahrain Race' }, { id: 's2', label: 'Monaco Race' }],
  rows: [
    { driverId: 'r', name: 'Red Bull Driver', teamName: 'Red Bull Racing', finalPosition: 1, points: 25, fastestLapMs: 60001, avgLapMs: 61000, totalPitTimeMs: 2034, positionsGained: 2 },
    { driverId: 'o', name: 'Other Driver', teamName: null, finalPosition: null, points: null, fastestLapMs: null, avgLapMs: null, totalPitTimeMs: null, positionsGained: null },
    { driverId: 'm', name: 'Mercedes Driver', teamName: 'Mercedes', finalPosition: 3, points: 15, fastestLapMs: 62000, avgLapMs: 63000, totalPitTimeMs: 0, positionsGained: -1 },
  ],
};

function renderPage() {
  return render(<StatisticsPage />);
}

describe('StatisticsPage additional states', () => {
  beforeEach(() => jest.clearAllMocks());

  test('formats season rows, supports every team tag type, and changes seasons', async () => {
    getStatistics.mockResolvedValue(season);
    renderPage();
    await screen.findByText('Red Bull Driver');

    expect(screen.getByLabelText('Red Bull Racing')).toHaveTextContent('RB');
    expect(screen.getByLabelText('Mercedes')).toHaveTextContent('MER');
    expect(screen.getByLabelText('Ferrari')).toHaveTextContent('FER');
    expect(screen.getByText('McLaren')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(1);
    expect(screen.getByText('1:00.001')).toBeInTheDocument();
    expect(screen.getByText('1 fixture')).toBeInTheDocument();
    expect(screen.getByText('2 fixtures')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2025' } });
    await waitFor(() => expect(getStatistics).toHaveBeenLastCalledWith({ view: 'season', season: 2025 }));
  });

  test('loads fixture tables, selector changes, and every comparison display format', async () => {
    getStatistics.mockResolvedValue(fixture);
    renderPage();
    fireEvent.click(screen.getByText('Fixture', { selector: '.tab' }));
    await screen.findByText('Bahrain Race');
    await waitFor(() => expect(screen.getByText('Avg lap')).toBeInTheDocument());

    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('-1')).toBeInTheDocument();
    expect(screen.getByText('2.03s')).toBeInTheDocument();
    expect(screen.getByText('0.00s')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(1);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 's2' } });
    await waitFor(() => expect(getStatistics).toHaveBeenLastCalledWith({ view: 'fixture', sessionId: 's2' }));
  });

  test('reports request errors and does not update an unmounted request', async () => {
    getStatistics.mockRejectedValueOnce(new Error('service unavailable'));
    renderPage();
    expect(await screen.findByText(/service unavailable/i)).toBeInTheDocument();

    let resolve;
    getStatistics.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const pending = renderPage();
    pending.unmount();
    await act(async () => resolve(season));
    expect(getStatistics).toHaveBeenCalledTimes(2);
  });
});
