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
});