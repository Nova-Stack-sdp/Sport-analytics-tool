import { fireEvent, render, screen } from '@testing-library/react';
import TelemetryTVPage from '../pages/TelemetryTVPage';
import { getTelemetryTVRace, getTelemetryTVRaces } from '../api/client';

jest.mock('../api/client', () => ({
  getTelemetryTVRaces: jest.fn(),
  getTelemetryTVRace: jest.fn(),
}));

const RACES = [
  {
    slug: 'toronto-2025',
    eventName: 'Ontario Honda Dealers Indy Toronto',
    sessionDate: '7/20/2025',
    totalLaps: 90,
    fieldSize: 27,
    video: { youtubeId: 'UO4c-wMLhso', embedStartSeconds: 184, videoDurationSeconds: 7759 },
  },
  {
    slug: 'indianapolis-500-2024',
    eventName: '108th Running of the Indianapolis 500',
    sessionDate: '5/26/2024',
    totalLaps: 200,
    fieldSize: 33,
    video: { youtubeId: 'fWwonhySrWg', embedStartSeconds: 10353, videoDurationSeconds: 20625 },
  },
];

const RACE_DETAIL = {
  session: { totalLaps: 2 },
  classification: [
    { CarNumber: '5', DriverName: "Pato O'Ward", TeamName: 'Arrow McLaren', PositionStart: 2, PositionFinish: 1 },
    { CarNumber: '26', DriverName: 'Colton Herta', TeamName: 'Andretti', PositionStart: 1, PositionFinish: 2 },
  ],
  leaderLaps: [
    { lap: 1, car: '26', lapTime: '01:04.0188', speed: 100.433, flag: 'Green' },
    { lap: 2, car: '5', lapTime: '01:03.5000', speed: 101.2, flag: 'Yellow' },
  ],
  lapChart: {
    positions: { 1: { 1: '26', 2: '5' }, 2: { 1: '5', 2: '26' } },
    flags: {},
    legend: {},
  },
  stats: {
    avgSpeedMph: 88.972,
    bestLap: { sec: 61.654, lap: 2, driver: "Pato O'Ward" },
    leadChangesOfficial: 3,
    leadDriversOfficial: 2,
    cautionCount: 1,
    cautionLaps: 1,
    passes: { total: 12, position: 9 },
    mostLapsLed: { driver: 'Colton Herta', car: '26', laps: 1 },
  },
  leaders: [{ car: '26', driver: 'Colton Herta', from: 1, to: 1, laps: 1 }],
  cautions: [{ from: 2, to: 2, laps: 1 }],
};

beforeEach(() => {
  getTelemetryTVRaces.mockReset();
  getTelemetryTVRace.mockReset();
});

describe('TelemetryTVPage', () => {
  test('loads the race catalogue and embeds the newest race video', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_DETAIL });
    render(<TelemetryTVPage />);

    const iframe = await screen.findByTitle('YouTube video player');
    expect(iframe).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/UO4c-wMLhso?enablejsapi=1&playsinline=1&start=184'
    );
    expect(screen.getByLabelText('Choose a race')).toHaveValue('toronto-2025');
    expect(screen.getByLabelText('Choose a race').closest('.video-panel')).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Ontario Honda Dealers Indy Toronto · 2025' })
    ).toBeInTheDocument();
    expect(await screen.findByRole('row', { name: /P1 26 Colton Herta/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Select race lap')).toHaveValue('1');
    expect(screen.getByText('89.0 mph')).toBeInTheDocument();
    expect(screen.getByText('Lap 1 of 2')).toBeInTheDocument();
  });

  test('switching races in the dropdown swaps the embedded video', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_DETAIL });
    render(<TelemetryTVPage />);

    await screen.findByTitle('YouTube video player');
    fireEvent.change(screen.getByLabelText('Choose a race'), {
      target: { value: 'indianapolis-500-2024' },
    });

    expect(screen.getByTitle('YouTube video player')).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/fWwonhySrWg?enablejsapi=1&playsinline=1&start=10353'
    );
    expect(screen.getByText('108th Running of the Indianapolis 500')).toBeInTheDocument();
    expect(getTelemetryTVRace).toHaveBeenLastCalledWith('indianapolis-500-2024');
    await screen.findByText('Official order at lap 1');
  });

  test('changing the lap updates the historical running order', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_DETAIL });
    render(<TelemetryTVPage />);

    await screen.findByText('Official order at lap 1');
    const lapControl = screen.getByLabelText('Select race lap');
    fireEvent.change(lapControl, { target: { value: '2' } });

    expect(await screen.findByText('Official order at lap 2')).toBeInTheDocument();
    expect(screen.getByText("Pato O'Ward").closest('tr')).toHaveTextContent('P1');
    expect(screen.getByText('Yellow')).toBeInTheDocument();
  });

  test('shows the unconfigured shell when the catalogue fails to load', async () => {
    getTelemetryTVRaces.mockRejectedValue(
      new Error('Request to /api/telemetry-tv/races failed with status 500')
    );
    render(<TelemetryTVPage />);

    expect(
      await screen.findByText('Request to /api/telemetry-tv/races failed with status 500')
    ).toBeInTheDocument();
    expect(screen.queryByTitle('YouTube video player')).not.toBeInTheDocument();
    expect(screen.getByText('No video source configured')).toBeInTheDocument();
    expect(screen.getByLabelText('Choose a race')).toHaveValue('');
  });
});
