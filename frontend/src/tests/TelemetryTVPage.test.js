import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

// Toronto ships curated broadcast pit stops (its official pit stop summary is
// empty): lap-level records with a basis label, covering fewer stops than the
// official classification. Positions are static so the ticker leads with the
// pit call.
const RACE_WITH_PIT_STOPS = {
  ...RACE_DETAIL,
  lapChart: {
    ...RACE_DETAIL.lapChart,
    positions: { 1: { 1: '26', 2: '5' }, 2: { 1: '26', 2: '5' } },
  },
  classification: [
    { CarNumber: '5', DriverName: "Pato O'Ward", TeamName: 'Arrow McLaren', PositionStart: 2, PositionFinish: 1, PitStops: 3 },
    { CarNumber: '26', DriverName: 'Colton Herta', TeamName: 'Andretti', PositionStart: 1, PositionFinish: 2, PitStops: 2 },
  ],
  pitStops: [
    {
      car: '5',
      driver: "O'Ward",
      total: 3,
      stops: [
        { stop: 1, raceLap: 1, video_s: 677, basis: 'stated' },
        { stop: 2, raceLap: 2, video_s: 2794, basis: 'video estimate' },
      ],
    },
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

// The page now renders router links (RacePickerBar's sync entry point), so
// every render needs a Router context.
function renderPage() {
  return render(
    <MemoryRouter>
      <TelemetryTVPage />
    </MemoryRouter>
  );
}

// The page loads no race by default: every test that needs the player or the
// race detail picks one in the dropdown first.
async function pickRace(slug = 'toronto-2025') {
  await screen.findByRole('option', { name: 'Ontario Honda Dealers Indy Toronto · 2025' });
  fireEvent.change(screen.getByLabelText('Choose a race'), { target: { value: slug } });
}

beforeEach(() => {
  getTelemetryTVRaces.mockReset();
  getTelemetryTVRace.mockReset();
});

describe('TelemetryTVPage', () => {
  test('opens on the guide and loads a race only after one is picked', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_DETAIL });
    renderPage();

    // Nothing is selected or loaded by default: the guide stands in for the
    // player and the detail endpoint is never called.
    expect(await screen.findByRole('region', { name: 'How to use Telemetry TV' })).toBeInTheDocument();
    expect(screen.getByText('Watch the broadcast. Read the race.')).toBeInTheDocument();
    expect(screen.queryByTitle('YouTube video player')).not.toBeInTheDocument();
    expect(screen.queryByText('Master Board')).not.toBeInTheDocument();
    expect(getTelemetryTVRace).not.toHaveBeenCalled();

    // Picking a race swaps the guide for the player; the detail still waits for play.
    await pickRace();
    const iframe = await screen.findByTitle('YouTube video player');
    // The race header names the broadcast before anything is playing.
    expect(screen.getByRole('region', { name: 'Race header' })).toHaveTextContent(
      'Ontario Honda Dealers Indy Toronto'
    );
    expect(screen.getByText('Live • 27 cars')).toBeInTheDocument();
    expect(screen.getByText('LAP -- / 90')).toBeInTheDocument();
    expect(screen.getByText('STANDBY')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'How to use Telemetry TV' })).not.toBeInTheDocument();
    expect(getTelemetryTVRace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Play race' }));

    expect(iframe).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/UO4c-wMLhso?enablejsapi=1&playsinline=1&start=184'
    );
    expect(screen.getByLabelText('Choose a race')).toHaveValue('toronto-2025');
    expect(screen.getByLabelText('Choose a race').closest('.race-picker-bar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'RaceSync' })).toHaveAttribute(
      'href',
      '/sync-f1-broadcast'
    );
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
    // The observation layer: named bands over the player and the running
    // order, with the race header now answering to the report. "Live
    // Broadcast" reads twice by design — band caption and player title.
    expect(screen.getAllByText('Live Broadcast')).toHaveLength(2);
    expect(screen.getByText('Live Order')).toBeInTheDocument();
    expect(screen.getByText('Race Control')).toBeInTheDocument();
    expect(screen.getByText('LAP 1 / 2')).toBeInTheDocument();
    expect(screen.getByText('GREEN')).toBeInTheDocument();
    // The analysis chapter marks sit between the live grid and the radar and
    // between the analysis row and the race sequence.
    expect(screen.getByText('Now we move from observation to analysis')).toBeInTheDocument();
    expect(screen.getByText('Deeper investigation')).toBeInTheDocument();
    // Final answers wait for the checkered flag: at lap 1 the race overview
    // band and the official classification stay out of view, and the lead
    // battle carries the running totals (the old Race So Far numbers).
    expect(screen.queryByRole('region', { name: 'Race overview' })).not.toBeInTheDocument();
    expect(screen.queryByText('Official Driver Stats')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Result' })).not.toBeInTheDocument();
    const leadBattle = screen.getByRole('region', { name: 'Lead battle' });
    expect(within(leadBattle).getByText('Lead stretches through lap 1 of 2')).toBeInTheDocument();
    const sofar = leadBattle.querySelector('.lead-battle-sofar');
    expect(sofar).toHaveTextContent('0 lead changes');
    expect(sofar).toHaveTextContent('0 laps under yellow');
    expect(screen.getByRole('img', { name: 'Colton Herta, laps 1 to 1' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'No cautions through selected lap' })).toBeInTheDocument();
    expect(screen.getByLabelText('Select race lap')).toHaveValue('1');
    expect(screen.getByText('Lap 1 of 2')).toBeInTheDocument();
  });

  test('switching races in the dropdown swaps the embedded video', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_DETAIL });
    renderPage();

    await pickRace('toronto-2025');
    expect(screen.getByTitle('YouTube video player')).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/UO4c-wMLhso?enablejsapi=1&playsinline=1&start=184'
    );
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
    renderPage();
    await pickRace();

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
    // Lap 2 is the checkered lap: the report phase opens (overview band and
    // the official classification) while the radar keeps narrating the move
    // of the race.
    expect(screen.getByRole('region', { name: 'Race overview' })).toBeInTheDocument();
    expect(screen.getByText('up 1 place this lap').closest('.battle-radar-highlight-chip'))
      .toHaveTextContent("Pato O'Ward up 1 place this lap");
    expect(screen.getByRole('columnheader', { name: 'Result' })).toBeInTheDocument();
  });

  test('follows the embedded video clock: the lap cursor tracks the reported time', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_WITH_CLOCK });
    renderPage();
    await pickRace();

    fireEvent.click(await screen.findByRole('button', { name: 'Play race' }));

    // 100 s is still the pre-race build-up (green flag 184 s): the
    // dashboards wait and the countdown says how far the broadcast is from
    // going green.
    await screen.findByRole('region', { name: 'Waiting for race start' });
    deliverPlayerTime(100);
    expect(screen.getByText('Broadcast to green')).toBeInTheDocument();

    // The green flag wakes them at lap 1.
    deliverPlayerTime(184);
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
    renderPage();
    await pickRace();

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
    renderPage();
    await pickRace();

    fireEvent.click(await screen.findByRole('button', { name: 'Play race' }));
    // The curated anchors place the green flag at 535 s, so the race and its
    // commentary both wait with the dashboards.
    await screen.findByRole('region', { name: 'Waiting for race start' });
    expect(screen.queryByText('Race start: Lap 1.')).not.toBeInTheDocument();

    // 600 s: past the green flag anchor (535 s), before the lap-2 anchor.
    deliverPlayerTime(600);
    expect(await screen.findByText('Green flag: Herta leads out of turn 1.')).toBeInTheDocument();
    expect(screen.getByLabelText('Select race lap')).toHaveValue('1');

    // 2500 s: lap 2 is running and the 2400 s caution has already aired.
    deliverPlayerTime(2500);
    expect(screen.getByText('Caution: debris at turn 5 halts the run.')).toBeInTheDocument();
    expect(screen.queryByText('Green flag: Herta leads out of turn 1.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Select race lap')).toHaveValue('2');
  });

  test('keeps the dashboards dark before the green flag and wakes them at race start', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_WITH_ANCHORS });
    renderPage();
    await pickRace();

    fireEvent.click(await screen.findByRole('button', { name: 'Play race' }));

    // The race report has landed but the broadcast is still pre-race
    // (green flag 535 s): no stats load into view — the standby card stands
    // in for every dashboard at once and names the moment it waits on.
    const waitCard = await screen.findByRole('region', { name: 'Waiting for race start' });
    expect(within(waitCard).getByText('Green flag')).toBeInTheDocument();
    expect(within(waitCard).getByText('0:08:55')).toBeInTheDocument();
    expect(screen.queryByText('Master Board')).not.toBeInTheDocument();
    expect(screen.queryByText('Official Driver Stats')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Race overview' })).not.toBeInTheDocument();
    expect(screen.queryByText('Race Intelligence')).not.toBeInTheDocument();

    // 100 s into the broadcast: still waiting, now with the countdown.
    deliverPlayerTime(100);
    expect(
      within(screen.getByRole('region', { name: 'Waiting for race start' })).getByText('7:15')
    ).toBeInTheDocument();

    // The green flag wakes every dashboard at lap 1.
    deliverPlayerTime(535);
    expect(await screen.findByText('Official order at lap 1')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Waiting for race start' })).not.toBeInTheDocument();

    // Scrubbing back into the build-up parks them again: the gate answers to
    // the video clock, not to time passing.
    deliverPlayerTime(300);
    await screen.findByRole('region', { name: 'Waiting for race start' });
    expect(screen.queryByText('Official order at lap 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Race Intelligence')).not.toBeInTheDocument();
  });

  test('plots the curated broadcast pit stops and calls them out in the ticker', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_WITH_PIT_STOPS });
    const { container } = renderPage();
    await pickRace();

    fireEvent.click(await screen.findByRole('button', { name: 'Play race' }));
    await screen.findByText('Official order at lap 1');

    fireEvent.change(screen.getByLabelText('Select race lap'), { target: { value: '2' } });
    await screen.findByText('Official order at lap 2');

    expect(container.querySelectorAll('.pit-stop-marker')).toHaveLength(2);
    expect(screen.getByText("Pit stop: O'Ward stops on lap 2.")).toBeInTheDocument();
    expect(screen.getByText('Broadcast-called stops only (2 of 5).')).toBeInTheDocument();
    // The strategy card's pit window reads the stop that just happened.
    expect(screen.getByText('Pit window')).toBeInTheDocument();
    expect(screen.getByText('0 laps since last stop')).toBeInTheDocument();
    expect(screen.getByText("Last called: O'Ward, lap 2")).toBeInTheDocument();
  });

  test('seeks the embedded video when the lap slider moves', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_WITH_CLOCK });
    renderPage();
    await pickRace();

    const iframe = await screen.findByTitle('YouTube video player');
    fireEvent.click(screen.getByRole('button', { name: 'Play race' }));
    // Green flag is 184 s in this fixture: the dashboards wait until then.
    await screen.findByRole('region', { name: 'Waiting for race start' });
    deliverPlayerTime(184);
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
    const { container } = renderPage();
    await pickRace();

    fireEvent.click(await screen.findByRole('button', { name: 'Play race' }));
    await screen.findByText('Official order at lap 1');

    expect(screen.getByText('Pace Trend')).toBeInTheDocument();
    const paceCard = container.querySelector('.ttv-instruments');
    // Lap 1 is the only lap run: one bar, the fastest lap known so far is
    // lap 1's 1:04.019, and the eventual 1:01.654 stays hidden as a spoiler.
    expect(paceCard.querySelectorAll('.pace-bar')).toHaveLength(1);
    expect(paceCard).toHaveTextContent('1:04.019');
    expect(paceCard).toHaveTextContent('Fastest lap so far');
    expect(paceCard).not.toHaveTextContent('1:01.654');
    // Lap 1 is the only green-flag lap: the green average reads its time.
    expect(paceCard).toHaveTextContent('Green average');
    expect(paceCard).toHaveTextContent('1 green-flag lap');

    // The strategy card reads the same single lap: not enough of a green run
    // to call tyre fall-off, no visible stops yet, and the selected lap IS
    // the fastest so far.
    expect(screen.getByText('Strategy / Tyre Analysis')).toBeInTheDocument();
    const strategyCard = container.querySelector('.strategy-card');
    expect(strategyCard).toHaveTextContent('Tyre degradation');
    expect(strategyCard).toHaveTextContent('Too early to call');
    expect(strategyCard).toHaveTextContent('Opening stint');
    expect(strategyCard).toHaveTextContent('Fastest lap');
    expect(strategyCard).toHaveTextContent('Fastest so far: 1:04.019 (lap 1)');
    // Race Control quotes the same fastest-so-far number.
    expect(screen.getByText('Fastest').closest('.status-item')).toHaveTextContent('1:04.019');

    fireEvent.change(screen.getByLabelText('Select race lap'), { target: { value: '2' } });
    await screen.findByText('Official order at lap 2');
    // The checkered lap completes the chart: both bars and the race fastest.
    expect(paceCard.querySelectorAll('.pace-bar')).toHaveLength(2);
    expect(paceCard).toHaveTextContent('1:01.654');
    expect(paceCard).toHaveTextContent('lap 2');
    expect(paceCard).toHaveTextContent('Fastest lap of the race');
    // The strategy rows follow the cursor: lap 2 is now the pace-setter.
    expect(strategyCard).toHaveTextContent('Fastest so far: 1:01.654 (lap 2)');
  });

  test('carries the conditions as a glyph beside the race title', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_WITH_STATS });
    renderPage();
    await pickRace();

    // The sky reads out of the curator's own note (Toronto ships "dry race
    // conditions with quick grip evolution"), and the glyph stands beside the
    // event name rather than in a card of its own.
    const header = screen.getByRole('region', { name: 'Race header' });
    expect(within(header).getByRole('img', { name: /Curator read: Dry · Grip building/ }))
      .toBeInTheDocument();
    expect(header.querySelector('.race-header-titles')).toHaveTextContent(
      'Ontario Honda Dealers Indy Toronto'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play race' }));
    await screen.findByText('Official order at lap 1');

    // The report has landed: still one glyph, still in the header.
    expect(within(header).getAllByRole('img')).toHaveLength(1);
  });

  test('folds the analysis cards away from their own heads', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_WITH_STATS });
    const { container } = renderPage();
    await pickRace();

    fireEvent.click(await screen.findByRole('button', { name: 'Play race' }));
    await screen.findByText('Official order at lap 1');

    // The analysis layer reads battle first, then the instruments, then
    // strategy — each one foldable from its own head.
    const panels = container.querySelectorAll('.ttv-panel');
    expect([...panels].map((panel) => panel.querySelector('.card-title').textContent)).toEqual([
      'Race Intelligence',
      'Race Instruments',
      'Strategy / Tyre Analysis',
    ]);

    const instruments = container.querySelector('.ttv-instruments');
    const body = instruments.querySelector('.ttv-panel-body');
    expect(body).not.toHaveAttribute('hidden');

    fireEvent.click(within(instruments).getByRole('button', { name: 'Collapse Race Instruments' }));
    expect(instruments.querySelector('.ttv-panel-body')).toHaveAttribute('hidden');
    // Folding is a view choice, not a data loss: the readings stay in the DOM.
    expect(instruments.querySelector('.ttv-panel-body')).toHaveTextContent('Pace Trend');

    fireEvent.click(within(instruments).getByRole('button', { name: 'Expand Race Instruments' }));
    expect(instruments.querySelector('.ttv-panel-body')).not.toHaveAttribute('hidden');
  });

  test('shows the official per-driver classification stats', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_WITH_STATS });
    const { container } = renderPage();
    await pickRace();

    fireEvent.click(await screen.findByRole('button', { name: 'Play race' }));
    await screen.findByText('Official order at lap 1');

    // The official classification is a final answer: it stays out of view
    // until the checkered lap.
    expect(screen.queryByText('Official Driver Stats')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Select race lap'), { target: { value: '2' } });
    await screen.findByText('Official order at lap 2');

    expect(screen.getByText('Official Driver Stats')).toBeInTheDocument();
    const rows = container.querySelectorAll('.driver-stats-table tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Pato O'Ward");
    expect(rows[0]).toHaveTextContent('Arrow McLaren');
    expect(rows[0]).toHaveTextContent('1:01.654');
    expect(rows[0]).toHaveTextContent('89.0');
    expect(rows[0]).toHaveTextContent('51');
    // Start slot and movement against it: O'Ward 10th to 1st (+9), Herta pole to 2nd (-1).
    const statsCard = container.querySelector('.driver-stats-card');
    expect(within(statsCard).getByRole('columnheader', { name: 'Start' })).toBeInTheDocument();
    expect(within(statsCard).getByRole('columnheader', { name: '+/-' })).toBeInTheDocument();
    expect(statsCard).toHaveTextContent('Final classification · full field of 2');
    expect(rows[0]).toHaveTextContent('10');
    expect(rows[0]).toHaveTextContent('+9');
    expect(rows[1]).toHaveTextContent('-1');
  });

  test('shows the official race overview band and the lead battle chart', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_DETAIL });
    const { container } = renderPage();
    await pickRace();

    fireEvent.click(await screen.findByRole('button', { name: 'Play race' }));
    await screen.findByText('Official order at lap 1');

    // Live phase: the lead battle replays only the laps already run — one
    // stretch, the lap-2 caution still ahead, running totals in the header —
    // and the race overview band is held back as a checkered-flag answer.
    const leadBattle = screen.getByRole('region', { name: 'Lead battle' });
    expect(within(leadBattle).getByText('Lead stretches through lap 1 of 2')).toBeInTheDocument();
    const sofar = leadBattle.querySelector('.lead-battle-sofar');
    expect(sofar).toHaveTextContent('0 lead changes');
    expect(sofar).toHaveTextContent('0 laps under yellow');
    expect(within(leadBattle).getByRole('img', {
      name: 'Lead stretches across 2 laps, 1 different leader',
    })).toBeInTheDocument();
    expect(container.querySelectorAll('.lead-battle-segment')).toHaveLength(1);
    expect(container.querySelectorAll('.lead-battle-caution')).toHaveLength(0);
    expect(within(leadBattle).getByText('Lap 1')).toBeInTheDocument();
    expect(within(leadBattle).getByText('Lap 2')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Race overview' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Select race lap'), { target: { value: '2' } });
    await screen.findByText('Official order at lap 2');

    // Overview band: the race-level numbers the payload carries. RACE_DETAIL
    // has no podium/pole/summary, so those tiles stay omitted rather than faked.
    const overview = screen.getByRole('region', { name: 'Race overview' });
    expect(within(overview).getByText('Official race report · 2 laps')).toBeInTheDocument();
    expect(within(overview).getByText('Fastest lap')).toBeInTheDocument();
    expect(within(overview).getByText('1:01.654')).toBeInTheDocument();
    expect(within(overview).getByText("Pato O'Ward · lap 2")).toBeInTheDocument();
    expect(within(overview).getByText('Average speed')).toBeInTheDocument();
    expect(within(overview).getByText('89.0 mph')).toBeInTheDocument();
    expect(within(overview).getByText('Lead changes')).toBeInTheDocument();
    expect(within(overview).getByText('2 leaders')).toBeInTheDocument();
    expect(within(overview).getByText('Cautions')).toBeInTheDocument();
    // Singular handling: the caution count sub and the most-laps-led sub both
    // read "1 lap" in this fixture.
    expect(within(overview).getAllByText('1 lap')).toHaveLength(2);
    expect(within(overview).getByText('Most laps led')).toBeInTheDocument();
    expect(within(overview).queryByText('Winner')).not.toBeInTheDocument();

    // Lead battle: two stretches across the 2-lap fixture, one caution window.
    expect(within(leadBattle).getByText('Official lead stretches across 2 laps')).toBeInTheDocument();
    expect(within(leadBattle).getByText('2 leaders')).toBeInTheDocument();
    expect(within(leadBattle).getByRole('img', {
      name: 'Lead stretches across 2 laps, 2 different leaders',
    })).toBeInTheDocument();
    expect(container.querySelectorAll('.lead-battle-segment')).toHaveLength(2);
    expect(container.querySelectorAll('.lead-battle-caution')).toHaveLength(1);
  });

  test('shows the leader margin and finish summary once the race completes', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    getTelemetryTVRace.mockResolvedValue({ race: RACE_WITH_STATS });
    const { container } = renderPage();
    await pickRace();

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
    renderPage();
    await pickRace();

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

  test('shows the unconfigured guide when the catalogue fails to load', async () => {
    getTelemetryTVRaces.mockRejectedValue(
      new Error('Request to /api/telemetry-tv/races failed with status 500')
    );
    renderPage();

    const guide = await screen.findByRole('region', { name: 'How to use Telemetry TV' });
    expect(
      await within(guide).findByText('Request to /api/telemetry-tv/races failed with status 500')
    ).toBeInTheDocument();
    expect(screen.queryByTitle('YouTube video player')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Choose a race')).toHaveValue('');
    expect(screen.getByRole('option', { name: 'No races available' })).toBeInTheDocument();
  });
});
