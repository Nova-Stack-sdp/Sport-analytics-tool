import { act, fireEvent, render, screen } from '@testing-library/react';
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
  leaders: [
    { car: '26', driver: 'Colton Herta', from: 1, to: 1, laps: 1 },
    { car: '5', driver: "Pato O'Ward", from: 2, to: 2, laps: 1 },
  ],
  cautions: [{ from: 2, to: 2, laps: 1 }],
};

// A race payload that ships a clock, so the video lapse maps to the lap
// cursor. 184 s = green flag, 248 s = lap 1 complete, 420 s = checkered.
const RACE_WITH_CLOCK = {
  ...RACE_DETAIL,
  clock: {
    checkpoints: [
      { event: 'Green flag (start of timing)', videoSeconds: 184 },
      { event: 'Lap 1 complete', videoSeconds: 248 },
      { event: 'Checkered flag (winner crosses)', videoSeconds: 420 },
    ],
  },
};

// Adds the payload facts item 2 surfaces: official lap timing plus the
// per-driver classification numbers the API already serves.
const RACE_WITH_STATS = {
  ...RACE_DETAIL,
  leaderLaps: [
    { lap: 1, car: '26', driver: 'Herta, Colton', lapTime: '01:04.0188', speed: 100.433, diff: '00:01.0451', flag: 'Green' },
    { lap: 2, car: '5', driver: "O'Ward, Pato", lapTime: '01:01.6540', speed: 104.285, diff: '00:01.0583', flag: 'Yellow' },
  ],
  classification: [
    {
      CarNumber: '5',
      DriverName: "Pato O'Ward",
      TeamName: 'Arrow McLaren',
      PositionStart: 10,
      PositionFinish: 1,
      BestLapTime: '01:01.6540',
      BestSpeed: 104.285,
      SpeedAvg: 88.972,
      LapsLed: 1,
      PitStops: 3,
      Status: 'Running',
      LapsComplete: 2,
      ElapsedTime: '00:02:05.6728',
      PointsEarned: 51,
    },
    {
      CarNumber: '26',
      DriverName: 'Colton Herta',
      TeamName: 'Andretti',
      PositionStart: 1,
      PositionFinish: 2,
      BestLapTime: '01:04.0188',
      BestSpeed: 100.433,
      SpeedAvg: 88.942,
      LapsLed: 1,
      PitStops: 2,
      Status: 'Running',
      LapsComplete: 2,
      ElapsedTime: '00:02:06.4019',
      PointsEarned: 41,
    },
  ],
  podium: [
    { pos: 1, car: '5', driver: "Pato O'Ward", team: 'Arrow McLaren', started: 10, lapsLed: 1 },
    { pos: 2, car: '26', driver: 'Colton Herta', team: 'Andretti', started: 1, lapsLed: 1 },
  ],
  pole: { car: '26', driver: 'Colton Herta' },
};

// Curated broadcast anchors: real video seconds with the lap numbers squeezed
// into the 2-lap fixture. 535 s = green flag, 1957 s = lap 2 running.
const RACE_WITH_ANCHORS = {
  ...RACE_DETAIL,
  lapCalibration: [
    { video_s: 535, lap: 1, basis: 'green flag' },
    { video_s: 1957, lap: 2, basis: 'stated lap 2' },
  ],
  events: [
    { id: 'e007', video_s: 535, type: 'green_flag', lap: 1, detail: 'Green flag: Herta leads out of turn 1.' },
    { id: 'e030', video_s: 2400, type: 'caution_start', lap: 2, detail: 'Caution: debris at turn 5 halts the run.' },
  ],
};

function deliverPlayerTime(seconds) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ event: 'infoDelivery', info: { currentTime: seconds } }),
      })
    );
  });
}

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
    expect(getTelemetryTVRace).not.toHaveBeenCalled();
    expect(screen.queryByText('Race So Far')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play race' }));

    expect(iframe).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/UO4c-wMLhso?enablejsapi=1&playsinline=1&start=184'
    );
    expect(screen.getByLabelText('Choose a race')).toHaveValue('toronto-2025');
    expect(screen.getByLabelText('Choose a race').closest('.video-panel')).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Ontario Honda Dealers Indy Toronto · 2025' })
    ).toBeInTheDocument();
    const p1Driver = await screen.findByText('Colton Herta', { selector: '.driver-meta span' });
    expect(screen.getByText('Race start: Lap 1.')).toBeInTheDocument();
    expect(p1Driver.closest('tr')).toHaveTextContent('P1');
    expect(p1Driver.closest('tr').cells[6]).toHaveTextContent('1');
    expect(p1Driver.closest('tr').cells[7]).toHaveTextContent('100.4 mph');
    const p2Driver = screen.getByText("Pato O'Ward", {
      selector: '.masterboard-table .driver-meta span',
    });
    expect(p2Driver.closest('tr').cells[7]).toHaveTextContent('mph');
    expect(p2Driver.closest('tr').cells[7]).toHaveTextContent('±2.0');
    expect(screen.getByText('Master Board')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Derived speed' })).toBeInTheDocument();
    expect(screen.getByText('Race So Far')).toBeInTheDocument();
    expect(screen.queryByText('Race Analysis')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Result' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Colton Herta, laps 1 to 1' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'No cautions through selected lap' })).toBeInTheDocument();
    expect(screen.getByLabelText('Select race lap')).toHaveValue('1');
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
    expect(getTelemetryTVRace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Play race' }));
    expect(getTelemetryTVRace).toHaveBeenLastCalledWith('indianapolis-500-2024');
    await screen.findByText('Official order at lap 1');
  });

  test('changing the lap updates the historical running order', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_DETAIL });
    render(<TelemetryTVPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Play race' }));
    await screen.findByText('Official order at lap 1');
    const lapControl = screen.getByLabelText('Select race lap');
    fireEvent.change(lapControl, { target: { value: '2' } });

    expect(await screen.findByText('Official order at lap 2')).toBeInTheDocument();
    expect(screen.getByText("Overtake: Pato O'Ward moves ahead of Colton Herta for P1.")).toBeInTheDocument();
    const leaderRow = screen.getByText("Pato O'Ward", { selector: '.driver-meta span' }).closest('tr');
    expect(leaderRow).toHaveTextContent('P1');
    expect(leaderRow.cells[6]).toHaveTextContent('2');
    expect(leaderRow.cells[7]).toHaveTextContent('101.2 mph ±2.0');
    const previousLeaderRow = screen.getByText('Colton Herta', {
      selector: '.masterboard-table .driver-meta span',
    }).closest('tr');
    expect(previousLeaderRow.cells[6]).toHaveTextContent('2');
    expect(previousLeaderRow.cells[7]).toHaveTextContent('101.2 mph');
    expect(previousLeaderRow.cells[7]).not.toHaveTextContent('±');
    expect(screen.getByText('Yellow')).toBeInTheDocument();
    expect(screen.getByText('Race Analysis')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Result' })).toBeInTheDocument();
  });

  test('follows the embedded video clock: the lap cursor tracks the reported time', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_WITH_CLOCK });
    render(<TelemetryTVPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Play race' }));
    await screen.findByText('Official order at lap 1');

    // 300 s sits between lap 1 complete (248 s) and the checkered flag: lap 2.
    deliverPlayerTime(300);

    expect(await screen.findByText('Official order at lap 2')).toBeInTheDocument();
    expect(screen.getByText('Video time').closest('.status-item')).toHaveTextContent('0:05:00');
    expect(screen.getByLabelText('Select race lap')).toHaveValue('2');
  });

  test('leaves the lap cursor alone when the race ships no clock calibration', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_DETAIL });
    render(<TelemetryTVPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Play race' }));
    await screen.findByText('Official order at lap 1');

    deliverPlayerTime(300);

    expect(screen.getByText('Video time').closest('.status-item')).toHaveTextContent('0:05:00');
    expect(screen.getByText('Official order at lap 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Select race lap')).toHaveValue('1');
  });

  test('ticker follows the curated broadcast anchors while the video plays', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_WITH_ANCHORS });
    render(<TelemetryTVPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Play race' }));
    await screen.findByText('Race start: Lap 1.');

    // 600 s: past the green flag anchor (535 s), before the lap-2 anchor.
    deliverPlayerTime(600);
    expect(screen.getByText('Green flag: Herta leads out of turn 1.')).toBeInTheDocument();
    expect(screen.getByLabelText('Select race lap')).toHaveValue('1');

    // 2500 s: lap 2 is running and the 2400 s caution has already aired.
    deliverPlayerTime(2500);
    expect(screen.getByText('Caution: debris at turn 5 halts the run.')).toBeInTheDocument();
    expect(screen.queryByText('Green flag: Herta leads out of turn 1.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Select race lap')).toHaveValue('2');
  });

  test('seeks the embedded video when the lap slider moves', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_WITH_CLOCK });
    render(<TelemetryTVPage />);

    const iframe = await screen.findByTitle('YouTube video player');
    fireEvent.click(screen.getByRole('button', { name: 'Play race' }));
    await screen.findByText('Official order at lap 1');

    const postMessage = jest.spyOn(iframe.contentWindow, 'postMessage').mockImplementation(() => {});
    postMessage.mockClear();
    fireEvent.change(screen.getByLabelText('Select race lap'), { target: { value: '2' } });

    expect(await screen.findByText('Official order at lap 2')).toBeInTheDocument();
    const seekCall = postMessage.mock.calls
      .map(([message]) => JSON.parse(message))
      .find((payload) => payload.func === 'seekTo');
    expect(seekCall).toEqual({ event: 'command', func: 'seekTo', args: [248, true] });
  });

  test('renders the pace trend from the official leader lap times', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_WITH_STATS });
    const { container } = render(<TelemetryTVPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Play race' }));
    await screen.findByText('Official order at lap 1');

    expect(screen.getByText('Pace Trend')).toBeInTheDocument();
    const paceCard = container.querySelector('.race-pace-card');
    expect(paceCard.querySelectorAll('.pace-bar')).toHaveLength(2);
    // Selected lap 1 is 1:04.019; the fastest lap of the race is 1:01.654.
    expect(paceCard).toHaveTextContent('1:04.019');
    expect(paceCard).toHaveTextContent('1:01.654');
    expect(paceCard).toHaveTextContent('lap 2');
  });

  test('shows the official per-driver classification stats', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_WITH_STATS });
    const { container } = render(<TelemetryTVPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Play race' }));
    await screen.findByText('Official order at lap 1');

    expect(screen.getByText('Official Driver Stats')).toBeInTheDocument();
    const rows = container.querySelectorAll('.driver-stats-table tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Pato O'Ward");
    expect(rows[0]).toHaveTextContent('1:01.654');
    expect(rows[0]).toHaveTextContent('89.0');
    expect(rows[0]).toHaveTextContent('51');
  });

  test('shows the leader margin and finish summary once the race completes', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_WITH_STATS });
    const { container } = render(<TelemetryTVPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Play race' }));
    await screen.findByText('Official order at lap 1');
    expect(screen.getByText('Leader margin').closest('.status-item')).toHaveTextContent('--');

    fireEvent.change(screen.getByLabelText('Select race lap'), { target: { value: '2' } });
    await screen.findByText('Official order at lap 2');

    expect(screen.getByText('Leader margin').closest('.status-item')).toHaveTextContent('1.1s');
    expect(screen.getByText('Finish Summary')).toBeInTheDocument();
    const finishCard = container.querySelector('.race-finish-card');
    expect(finishCard.querySelectorAll('.podium-row')).toHaveLength(2);
    expect(finishCard).toHaveTextContent("Pato O'Ward");
    expect(finishCard).toHaveTextContent('1:01.654');
    expect(finishCard).toHaveTextContent('0:02:05');
    expect(finishCard).not.toHaveTextContent('Retirements');
  });

  test('keeps a driver on their last recorded lap when absent from a later chart', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({
      race: {
        ...RACE_DETAIL,
        session: { totalLaps: 3 },
        leaderLaps: [...RACE_DETAIL.leaderLaps, { lap: 3, car: '5', speed: 99.5 }],
        lapChart: {
          ...RACE_DETAIL.lapChart,
          positions: {
            ...RACE_DETAIL.lapChart.positions,
            3: { 1: '5' },
          },
        },
      },
    });
    render(<TelemetryTVPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Play race' }));
    await screen.findByText('Official order at lap 1');
    fireEvent.change(screen.getByLabelText('Select race lap'), { target: { value: '3' } });

    expect(await screen.findByText('Official order at lap 3')).toBeInTheDocument();
    const leaderRow = screen.getByText("Pato O'Ward", {
      selector: '.masterboard-table .driver-meta span',
    }).closest('tr');
    const previousLapRow = screen.getByText('Colton Herta', {
      selector: '.masterboard-table .driver-meta span',
    }).closest('tr');
    expect(leaderRow.cells[6]).toHaveTextContent('3');
    expect(leaderRow.cells[7]).toHaveTextContent('99.5 mph ±2.0');
    expect(previousLapRow.cells[6]).toHaveTextContent('2');
    expect(previousLapRow.cells[7]).toHaveTextContent('99.5 mph');
    expect(previousLapRow.cells[7]).not.toHaveTextContent('±');
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
