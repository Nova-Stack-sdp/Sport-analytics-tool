import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RaceReplayPage from '../pages/RaceReplayPage';
import * as apiClient from '../api/client';

const SAMPLE_STATE = {
  videoSeconds: 0,
  session: { meetingName: 'Spanish Grand Prix', sessionName: 'Race', currentLap: 3, totalLaps: 66 },
  leaderboard: [
    { position: 1, driverNumber: 63, driverName: 'George Russell', teamName: 'Mercedes', tyreCompound: 'MEDIUM' },
    { position: 2, driverNumber: 44, driverName: 'Lewis Hamilton', teamName: 'Ferrari', tyreCompound: 'MEDIUM' },
    { position: 3, driverNumber: 1, driverName: 'Max Verstappen', teamName: 'Red Bull Racing', tyreCompound: 'SOFT' },
  ],
  recentRaceControl: [],
};

const SAFETY_CAR_STATE = {
  ...SAMPLE_STATE,
  recentRaceControl: [
    { date: '2026-05-24T13:10:00Z', category: 'SafetyCar', flag: null, message: 'SAFETY CAR DEPLOYED' },
  ],
};

describe('race replay page (real data, mocked API)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    // Every test exercises the fallback track shape unless it explicitly
    // overrides this — matches the earlier tests' assumptions, which were
    // written before real track-shape fetching existed.
    jest.spyOn(apiClient, 'getTrackShape').mockRejectedValue(new Error('no track shape in test'));
  });

  test('shows a loading state, then the real leaderboard once data resolves', async () => {
    jest.spyOn(apiClient, 'getWatchLiveState').mockResolvedValue(SAMPLE_STATE);
    render(<RaceReplayPage />);

    expect(screen.getByText(/Loading Barcelona 2026 session data/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('George Russell')).toBeInTheDocument());
    expect(screen.getByText('Max Verstappen')).toBeInTheDocument();
    expect(screen.getAllByText('MEDIUM').length).toBeGreaterThan(0);
  });

  test('shows an error state and lets the user retry', async () => {
    jest.spyOn(apiClient, 'getWatchLiveState').mockRejectedValue(new Error('network down'));
    render(<RaceReplayPage />);
    await waitFor(() => expect(screen.getByText(/Couldn't load replay data/i)).toBeInTheDocument());
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });

  test('detects a real safety car period from race control messages', async () => {
    jest.spyOn(apiClient, 'getWatchLiveState').mockResolvedValue(SAFETY_CAR_STATE);
    render(<RaceReplayPage />);
    await waitFor(() => expect(screen.getByText('Safety car deployed')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Show safety car'));
    expect(screen.queryByText('Safety car deployed')).not.toBeInTheDocument();
  });

  test('pause button toggles its own label', async () => {
    jest.spyOn(apiClient, 'getWatchLiveState').mockResolvedValue(SAMPLE_STATE);
    render(<RaceReplayPage />);
    await waitFor(() => expect(screen.getByText('⏸ Pause')).toBeInTheDocument());
    fireEvent.click(screen.getByText('⏸ Pause'));
    expect(screen.getByText('▶ Play')).toBeInTheDocument();
  });

  test('shows final classification with a winner once the session ends', async () => {
    const endedError = new Error('videoSeconds out of range');
    endedError.status = 400;
    jest.spyOn(apiClient, 'getWatchLiveState')
      .mockResolvedValueOnce(SAMPLE_STATE)
      .mockRejectedValue(endedError);
    render(<RaceReplayPage />);

    await waitFor(() => expect(screen.getByText('George Russell')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/wins/i)).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText(/George Russell wins/i)).toBeInTheDocument();
    expect(screen.getByText('Final Classification')).toBeInTheDocument();
    expect(screen.getByText('⟲ Watch again')).toBeInTheDocument();
  });

  test('shows a graceful fallback if the session ends before any data ever loaded', async () => {
    const endedError = new Error('videoSeconds out of range');
    endedError.status = 400;
    jest.spyOn(apiClient, 'getWatchLiveState').mockRejectedValue(endedError);
    render(<RaceReplayPage />);

    await waitFor(() => expect(screen.getByText(/no classification data available/i)).toBeInTheDocument());
    expect(screen.getByText('⟲ Watch again')).toBeInTheDocument();
  });

  test('uses the real track shape once it loads, hiding the illustrative-track note', async () => {
    const points = Array.from({ length: 30 }, (_, i) => {
      const theta = (i / 30) * Math.PI * 2;
      return { x: 500 * Math.cos(theta), y: 500 * Math.sin(theta) };
    });
    jest.spyOn(apiClient, 'getTrackShape').mockResolvedValue({ points, sourceDriverNumber: 1 });
    jest.spyOn(apiClient, 'getWatchLiveState').mockResolvedValue(SAMPLE_STATE);
    render(<RaceReplayPage />);

    await waitFor(() => expect(screen.getByText('George Russell')).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText(/illustrative track/i)).not.toBeInTheDocument());
  });

  test('shows the illustrative-track note when no real track shape is available', async () => {
    jest.spyOn(apiClient, 'getWatchLiveState').mockResolvedValue(SAMPLE_STATE);
    render(<RaceReplayPage />);
    await waitFor(() => expect(screen.getByText(/illustrative track/i)).toBeInTheDocument());
  });

  test('skip to end probes the backend for the true end and jumps there', async () => {
    const rangeError = new Error('range');
    rangeError.status = 400;
    rangeError.body = { maxVideoSeconds: 42 };

    const mockFn = jest.fn((args) => {
      if (args.videoSeconds === 100000) return Promise.reject(rangeError);
      return Promise.resolve({ ...SAMPLE_STATE, videoSeconds: args.videoSeconds });
    });
    jest.spyOn(apiClient, 'getWatchLiveState').mockImplementation(mockFn);

    render(<RaceReplayPage />);
    await waitFor(() => expect(screen.getByText('George Russell')).toBeInTheDocument());

    fireEvent.click(screen.getByText('⏭ Skip to end'));

    await waitFor(() => expect(mockFn).toHaveBeenCalledWith({ videoSeconds: 100000 }));
    await waitFor(() => expect(mockFn).toHaveBeenCalledWith({ videoSeconds: 42 }));
  });

  test('skip to end still works against an old backend without the structured maxVideoSeconds field', async () => {
    const oldStyleError = new Error('range');
    oldStyleError.status = 400;
    oldStyleError.body = { error: 'videoSeconds must be between 0 and 77' }; // no maxVideoSeconds field

    const mockFn = jest.fn((args) => {
      if (args.videoSeconds === 100000) return Promise.reject(oldStyleError);
      return Promise.resolve({ ...SAMPLE_STATE, videoSeconds: args.videoSeconds });
    });
    jest.spyOn(apiClient, 'getWatchLiveState').mockImplementation(mockFn);

    render(<RaceReplayPage />);
    await waitFor(() => expect(screen.getByText('George Russell')).toBeInTheDocument());
    fireEvent.click(screen.getByText('⏭ Skip to end'));

    await waitFor(() => expect(mockFn).toHaveBeenCalledWith({ videoSeconds: 77 }));
  });

  test('shows a visible error if skip to end genuinely fails, instead of doing nothing', async () => {
    const genuineFailure = new Error('network error');
    genuineFailure.status = 500;

    const mockFn = jest.fn((args) => {
      if (args.videoSeconds === 100000) return Promise.reject(genuineFailure);
      return Promise.resolve(SAMPLE_STATE);
    });
    jest.spyOn(apiClient, 'getWatchLiveState').mockImplementation(mockFn);

    render(<RaceReplayPage />);
    await waitFor(() => expect(screen.getByText('George Russell')).toBeInTheDocument());
    fireEvent.click(screen.getByText('⏭ Skip to end'));

    await waitFor(() => expect(screen.getByText(/backend hasn't been redeployed/i)).toBeInTheDocument());
  });
});