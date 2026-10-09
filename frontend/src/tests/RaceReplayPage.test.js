import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RaceReplayPage from '../pages/RaceReplayPage';
import { PreferencesProvider } from '../context/PreferencesContext';
import * as apiClient from '../api/client';

const FIXTURES = {
  fixtures: [
    { id: 's1', meetingName: 'Spanish Grand Prix', season: 2026, type: 'Race', replayReady: true },
    { id: 's2', meetingName: 'Not Synced Grand Prix', season: 2026, type: 'Race', replayReady: false },
  ],
};

function makeState(overrides = {}) {
  return {
    lap: 3,
    totalLaps: 66,
    atEnd: false,
    session: { meetingName: 'Spanish Grand Prix', sessionName: 'Race', currentLap: 3, totalLaps: 66 },
    leaderboard: [
      { entryId: 'e1', driverNumber: 63, driverName: 'George Russell', teamName: 'Mercedes', tyreCompound: 'MEDIUM', position: 1 },
      { entryId: 'e2', driverNumber: 44, driverName: 'Lewis Hamilton', teamName: 'Ferrari', tyreCompound: 'MEDIUM', position: 2 },
      { entryId: 'e3', driverNumber: 1, driverName: 'Max Verstappen', teamName: 'Red Bull Racing', tyreCompound: 'SOFT', position: 3 },
    ],
    recentRaceControl: [],
    ...overrides,
  };
}

const SAFETY_CAR_STATE = makeState({
  recentRaceControl: [
    { date: '2026-05-24T13:10:00Z', category: 'SafetyCar', flag: null, message: 'SAFETY CAR DEPLOYED' },
  ],
});

function renderPage(path = '/replay') {
  return render(<MemoryRouter initialEntries={[path]}><RaceReplayPage /></MemoryRouter>);
}

describe('race replay page (real data, mocked API)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(apiClient, 'getFixtures').mockResolvedValue(FIXTURES);
    // Every test exercises the fallback track shape unless it explicitly
    // overrides this.
    jest.spyOn(apiClient, 'getRaceReplayTrackShape').mockRejectedValue(new Error('no track shape in test'));
  });

  test('auto-selects the first replay-ready match and shows the real leaderboard once data resolves', async () => {
    jest.spyOn(apiClient, 'getRaceReplayState').mockResolvedValue(makeState());
    renderPage();

    await waitFor(() => expect(screen.getByLabelText(/select a session to replay/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('George Russell')).toBeInTheDocument());
    expect(screen.getByText('Max Verstappen')).toBeInTheDocument();
    expect(screen.getAllByText('MEDIUM').length).toBeGreaterThan(0);
  });

  test('only lists replay-ready fixtures in the picker', async () => {
    jest.spyOn(apiClient, 'getRaceReplayState').mockResolvedValue(makeState());
    renderPage();

    await waitFor(() => expect(screen.getByLabelText(/select a session to replay/i)).toBeInTheDocument());
    expect(screen.queryByText(/Not Synced Grand Prix/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Spanish Grand Prix/i)).toBeInTheDocument();
  });

  test('shows a message instead of a picker when no fixture is replay-ready', async () => {
    apiClient.getFixtures.mockResolvedValue({ fixtures: [{ id: 's2', meetingName: 'Not Synced Grand Prix', season: 2026, type: 'Race', replayReady: false }] });
    renderPage();

    await waitFor(() => expect(screen.getByText(/no synced sessions have enough data/i)).toBeInTheDocument());
    expect(screen.queryByLabelText(/select a session to replay/i)).not.toBeInTheDocument();
  });

  test('shows an error state and lets the user retry', async () => {
    jest.spyOn(apiClient, 'getRaceReplayState').mockRejectedValue(new Error('network down'));
    renderPage();
    await waitFor(() => expect(screen.getByText(/Couldn't load replay data/i)).toBeInTheDocument());
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });

  test('detects a real safety car period from race control messages', async () => {
    jest.spyOn(apiClient, 'getRaceReplayState').mockResolvedValue(SAFETY_CAR_STATE);
    renderPage();
    await waitFor(() => expect(screen.getByText('Safety car deployed')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Show safety car'));
    expect(screen.queryByText('Safety car deployed')).not.toBeInTheDocument();
  });

  test('starts with the default speed and safety-car choice from Settings', async () => {
    window.localStorage.setItem(
      'f1-analytics-preferences',
      JSON.stringify({ replaySpeed: 4, replayShowSafetyCar: false })
    );
    jest.spyOn(apiClient, 'getRaceReplayState').mockResolvedValue(SAFETY_CAR_STATE);
    render(<MemoryRouter><PreferencesProvider><RaceReplayPage /></PreferencesProvider></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('4×')).toBeInTheDocument());
    expect(screen.getByLabelText('Show safety car')).not.toBeChecked();
    expect(screen.queryByText('Safety car deployed')).not.toBeInTheDocument();
    window.localStorage.clear();
  });

  test('pause button toggles its own label', async () => {
    jest.spyOn(apiClient, 'getRaceReplayState').mockResolvedValue(makeState());
    renderPage();
    await waitFor(() => expect(screen.getByText('⏸ Pause')).toBeInTheDocument());
    fireEvent.click(screen.getByText('⏸ Pause'));
    expect(screen.getByText('▶ Play')).toBeInTheDocument();
  });

  test('shows final classification with a winner once the backend reports atEnd', async () => {
    jest.spyOn(apiClient, 'getRaceReplayState').mockResolvedValue(makeState({ atEnd: true, lap: 66 }));
    renderPage();

    await waitFor(() => expect(screen.getByText(/wins/i)).toBeInTheDocument());
    expect(screen.getByText(/George Russell wins/i)).toBeInTheDocument();
    expect(screen.getByText('Final Classification')).toBeInTheDocument();
    expect(screen.getByText('⟲ Watch again')).toBeInTheDocument();
  });

  test('uses the real track shape once it loads, hiding the illustrative-track note', async () => {
    const points = Array.from({ length: 30 }, (_, i) => {
      const theta = (i / 30) * Math.PI * 2;
      return { x: 500 * Math.cos(theta), y: 500 * Math.sin(theta) };
    });
    apiClient.getRaceReplayTrackShape.mockResolvedValue({ points, sourceDriverNumber: 1, source: 'fastf1-static-fallback' });
    jest.spyOn(apiClient, 'getRaceReplayState').mockResolvedValue(makeState());
    renderPage();

    await waitFor(() => expect(screen.getByText('George Russell')).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText(/illustrative track/i)).not.toBeInTheDocument());
    expect(screen.getByText('Track outline from a FastF1 trace of this circuit.')).toBeInTheDocument();
  });

  test('shows the illustrative-track note when no real track shape is available', async () => {
    jest.spyOn(apiClient, 'getRaceReplayState').mockResolvedValue(makeState());
    renderPage();
    await waitFor(() => expect(screen.getByText(/illustrative track/i)).toBeInTheDocument());
  });

  test('skip to end jumps straight to the known final lap — no more probing the backend for it', async () => {
    const mockFn = jest.fn((sessionId, { lap }) =>
      Promise.resolve(makeState({ lap, atEnd: lap >= 66 }))
    );
    jest.spyOn(apiClient, 'getRaceReplayState').mockImplementation(mockFn);

    renderPage();
    await waitFor(() => expect(screen.getByText('George Russell')).toBeInTheDocument());

    fireEvent.click(screen.getByText('⏭ Skip to end'));

    await waitFor(() => expect(mockFn).toHaveBeenCalledWith('s1', { lap: 66 }));
  });

  test('switching the match in the picker resets the replay and refetches for the new session', async () => {
    apiClient.getFixtures.mockResolvedValue({
      fixtures: [
        { id: 's1', meetingName: 'Spanish Grand Prix', season: 2026, type: 'Race', replayReady: true },
        { id: 's-other', meetingName: 'Monaco Grand Prix', season: 2026, type: 'Race', replayReady: true },
      ],
    });
    const mockFn = jest.fn((sessionId) =>
      Promise.resolve(makeState({
        session: { meetingName: sessionId === 's-other' ? 'Monaco Grand Prix' : 'Spanish Grand Prix', sessionName: 'Race', currentLap: 3, totalLaps: 66 },
      }))
    );
    jest.spyOn(apiClient, 'getRaceReplayState').mockImplementation(mockFn);

    renderPage();
    await waitFor(() => expect(screen.getByText('George Russell')).toBeInTheDocument());
    expect(mockFn).toHaveBeenCalledWith('s1', expect.anything());

    fireEvent.change(screen.getByLabelText(/select a session to replay/i), { target: { value: 's-other' } });

    await waitFor(() => expect(mockFn).toHaveBeenCalledWith('s-other', expect.anything()));
  });

  test('uses the safety-car state the API works out, not just the last few messages', async () => {
    jest.spyOn(apiClient, 'getRaceReplayState').mockResolvedValue(makeState({
      safetyCar: null,
      recentRaceControl: [{ category: 'SafetyCar', flag: null, message: 'SAFETY CAR DEPLOYED' }],
    }));
    renderPage();
    await waitFor(() => expect(screen.getByText('George Russell')).toBeInTheDocument());
    expect(screen.queryByText('Safety car deployed')).not.toBeInTheDocument();
  });

  test('shows a virtual safety car as its own state', async () => {
    jest.spyOn(apiClient, 'getRaceReplayState').mockResolvedValue(makeState({ safetyCar: 'VSC' }));
    renderPage();
    expect(await screen.findByText('Virtual safety car')).toBeInTheDocument();
    expect(screen.queryByText('Safety car deployed')).not.toBeInTheDocument();
  });

  test('labels cars with surname codes and describes the order as at this lap, not live', async () => {
    jest.spyOn(apiClient, 'getRaceReplayState').mockResolvedValue(makeState());
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('George Russell')).toBeInTheDocument());
    const labels = [...container.querySelectorAll('.replay-dot-label')].map((n) => n.textContent);
    expect(labels).toEqual(expect.arrayContaining(['RUS', 'HAM', 'VER']));
    expect(screen.getByText('Race order and tyre compounds at this lap')).toBeInTheDocument();
    expect(screen.queryByText(/Live race order/)).not.toBeInTheDocument();
  });

  test('final classification marks retirements instead of giving them a position', async () => {
    jest.spyOn(apiClient, 'getRaceReplayState').mockResolvedValue(makeState({
      atEnd: true,
      lap: 66,
      leaderboard: [
        { entryId: 'e1', driverNumber: 63, driverName: 'George Russell', teamName: 'Mercedes', position: 1, status: 'finished' },
        { entryId: 'e3', driverNumber: 1, driverName: 'Max Verstappen', teamName: 'Red Bull Racing', position: null, status: 'dnf' },
      ],
    }));
    renderPage();
    expect(await screen.findByText('DNF')).toBeInTheDocument();
    expect(screen.getByText('🏆')).toBeInTheDocument();
  });

  test('opens the session named in the address and links to its event log; no Watch Live link', async () => {
    apiClient.getFixtures.mockResolvedValue({
      fixtures: [
        { id: 's1', meetingName: 'Spanish Grand Prix', season: 2026, type: 'Race', replayReady: true },
        { id: 's0', meetingName: 'Abu Dhabi Grand Prix', season: 2025, type: 'Race', replayReady: true },
      ],
    });
    const mockFn = jest.fn(() => Promise.resolve(makeState()));
    jest.spyOn(apiClient, 'getRaceReplayState').mockImplementation(mockFn);
    renderPage('/replay?session=s0');
    await waitFor(() => expect(mockFn).toHaveBeenCalledWith('s0', expect.anything()));
    expect(screen.getByRole('link', { name: 'Open its event log' })).toHaveAttribute('href', '/fixtures?session=s0');
    expect(screen.getByRole('group', { name: '2025' })).toBeInTheDocument();
    expect(screen.queryByText(/Watch Live/)).not.toBeInTheDocument();
  });
});
