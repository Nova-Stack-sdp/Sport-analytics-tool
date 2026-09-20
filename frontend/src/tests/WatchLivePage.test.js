import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WatchLivePage from '../pages/WatchLivePage';
import { useWatchLivePlayback } from '../hooks/useWatchLivePlayback';

jest.mock('../hooks/useWatchLivePlayback');

const SAMPLE_STATE = {
  videoSeconds: 125,
  session: {
    meetingName: 'Spanish Grand Prix',
    sessionName: 'Race',
    currentLap: 12,
    totalLaps: 66,
  },
  weather: { airTemperature: 24, rainfall: 0 },
  recentAnchors: [{ description: 'Hamilton closes the gap into turn one.' }],
  leaderboard: [
    {
      driverNumber: 44,
      position: 1,
      driverName: 'Lewis Hamilton',
      teamName: 'Ferrari',
      lastLapTime: 91.2,
      gapToAhead: 0,
      speedKph: 314,
      tyreCompound: 'MEDIUM',
      gridDelta: 2,
    },
  ],
};

describe('WatchLivePage', () => {
  afterEach(() => jest.clearAllMocks());

  test('shows loading telemetry and the empty dashboard before playback syncs', () => {
    useWatchLivePlayback.mockReturnValue({
      iframeRef: { current: null },
      state: null,
      snapshots: [],
      error: null,
      loading: true,
    });

    render(<WatchLivePage />);

    expect(screen.getByText(/Loading race telemetry/i)).toBeInTheDocument();
    expect(screen.getByText(/Find a race above, load its telemetry/i)).toBeInTheDocument();
    expect(screen.getByText(/Awaiting sync/)).toBeInTheDocument();
  });

  test('renders synchronized telemetry, ticker content, and race insights', () => {
    useWatchLivePlayback.mockReturnValue({
      iframeRef: { current: null },
      state: SAMPLE_STATE,
      snapshots: [SAMPLE_STATE],
      error: null,
      loading: false,
    });

    render(<WatchLivePage />);

    expect(screen.getByText('Spanish Grand Prix')).toBeInTheDocument();
    expect(screen.getByText('Synchronized')).toBeInTheDocument();
    expect(screen.getAllByText('Lewis Hamilton').length).toBeGreaterThan(0);
    expect(screen.getByText('Hamilton closes the gap into turn one.')).toBeInTheDocument();
    expect(screen.getByText('Race Pulse')).toBeInTheDocument();
    expect(screen.getByText('Battle Radar')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Season'), { target: { value: '2024' } });
    fireEvent.change(screen.getByLabelText('Grand Prix name contains'), { target: { value: 'Monaco' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find race' }));
  });

  test('keeps the dashboard usable and displays a telemetry error', () => {
    useWatchLivePlayback.mockReturnValue({
      iframeRef: { current: null },
      state: null,
      snapshots: [],
      error: 'telemetry unavailable',
      loading: false,
    });

    render(<WatchLivePage />);

    expect(screen.getByText('telemetry unavailable')).toBeInTheDocument();
    expect(screen.getByText(/Find a race above, load its telemetry/i)).toBeInTheDocument();
    expect(screen.queryByText(/Loading race telemetry/i)).not.toBeInTheDocument();
  });
});