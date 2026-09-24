import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RaceReplayPage from '../pages/RaceReplayPage';
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
    render(<RaceReplayPage />);

    await waitFor(() => expect(screen.getByLabelText(/select a match to replay/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('George Russell')).toBeInTheDocument());
    expect(screen.getByText('Max Verstappen')).toBeInTheDocument();
    expect(screen.getAllByText('MEDIUM').length).toBeGreaterThan(0);
  });

  test('only lists replay-ready fixtures in the picker', async () => {
    jest.spyOn(apiClient, 'getRaceReplayState').mockResolvedValue(makeState());
    render(<RaceReplayPage />);

    await waitFor(() => expect(screen.getByLabelText(/select a match to replay/i)).toBeInTheDocument());
    expect(screen.queryByText(/Not Synced Grand Prix/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Spanish Grand Prix/i)).toBeInTheDocument();
  });

  test('shows a message instead of a picker when no fixture is replay-ready', async () => {
    apiClient.getFixtures.mockResolvedValue({ fixtures: [{ id: 's2', meetingName: 'Not Synced Grand Prix', season: 2026, type: 'Race', replayReady: false }] });
    render(<RaceReplayPage />);

    await waitFor(() => expect(screen.getByText(/no synced sessions have enough data/i)).toBeInTheDocument());
    expect(screen.queryByLabelText(/select a match to replay/i)).not.toBeInTheDocument();
  });

  test('shows an error state and lets the user retry', async () => {
    jest.spyOn(apiClient, 'getRaceReplayState').mockRejectedValue(new Error('network down'));
    render(<RaceReplayPage />);
    await waitFor(() => expect(screen.getByText(/Couldn't load replay data/i)).toBeInTheDocument());
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });

  test('detects a real safety car period from race control messages', async () => {
    jest.spyOn(apiClient, 'getRaceReplayState').mockResolvedValue(SAFETY_CAR_STATE);
    render(<RaceReplayPage />);
    await waitFor(() => expect(screen.getByText('Safety car deployed')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Show safety car'));
    expect(screen.queryByText('Safety car deployed')).not.toBeInTheDocument();
  });

  test('pause button toggles its own label', async () => {
    jest.spyOn(apiClient, 'getRaceReplayState').mockResolvedValue(makeState());
    render(<RaceReplayPage />);
    await waitFor(() => expect(screen.getByText('⏸ Pause')).toBeInTheDocument());
    fireEvent.click(screen.getByText('⏸ Pause'));
    expect(screen.getByText('▶ Play')).toBeInTheDocument();
  });

  test('shows final classification with a winner once the backend reports atEnd', async () => {
    jest.spyOn(apiClient, 'getRaceReplayState').mockResolvedValue(makeState({ atEnd: true, lap: 66 }));
    render(<RaceReplayPage />);

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
    apiClient.getRaceReplayTrackShape.mockResolvedValue({ points, sourceDriverNumber: 1 });
    jest.spyOn(apiClient, 'getRaceReplayState').mockResolvedValue(makeState());
    render(<RaceReplayPage />);

    await waitFor(() => expect(screen.getByText('George Russell')).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText(/illustrative track/i)).not.toBeInTheDocument());
  });

  test('shows the illustrative-track note when no real track shape is available', async () => {
    jest.spyOn(apiClient, 'getRaceReplayState').mockResolvedValue(makeState());
    render(<RaceReplayPage />);
    await waitFor(() => expect(screen.getByText(/illustrative track/i)).toBeInTheDocument());
  });

  test('skip to end jumps straight to the known final lap — no more probing the backend for it', async () => {
    const mockFn = jest.fn((sessionId, { lap }) =>
      Promise.resolve(makeState({ lap, atEnd: lap >= 66 }))
    );
    jest.spyOn(apiClient, 'getRaceReplayState').mockImplementation(mockFn);

    render(<RaceReplayPage />);
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

    render(<RaceReplayPage />);
    await waitFor(() => expect(screen.getByText('George Russell')).toBeInTheDocument());
    expect(mockFn).toHaveBeenCalledWith('s1', expect.anything());

    fireEvent.change(screen.getByLabelText(/select a match to replay/i), { target: { value: 's-other' } });

    await waitFor(() => expect(mockFn).toHaveBeenCalledWith('s-other', expect.anything()));
  });
});