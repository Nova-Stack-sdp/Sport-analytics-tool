import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import App from './App';
import { auth } from './firebase';
import {
  getDrivers,
  getFixtures,
  getNotifications,
  getRaceReplayState,
  getRaceReplayTrackShape,
  getRaceReplayLapSeries,
  getSession,
  getTeams,
  markNotificationRead,
  requestEmailVerificationCode,
  confirmEmailVerificationCode,
  setDeveloperModeOnServer,
} from './api/client';

// AuthContext drives everything route-protection-related, so control it
// directly here rather than letting real Firebase try to restore a session
// in jsdom.
let authCallback;
jest.mock('./firebase', () => ({
  auth: {},
  googleProvider: {},
  githubProvider: {},
}));
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (authInstance, callback) => {
    authCallback = callback;
    return () => {};
  },
  signOut: jest.fn(),
}));
// setDeveloperModeOnServer is the one new export AuthContext/DeveloperModeContext
// need deterministic control over here; everything else (getSession, the data
// endpoints other pages call) keeps its real implementation, same as before —
// those already just hit the network and fail gracefully in this environment.
jest.mock('./api/client', () => ({
  ...jest.requireActual('./api/client'),
  setDeveloperModeOnServer: jest.fn(),
  // Controls the backend's answer to "is this user an admin?" (and the
  // cookie-session fallback). Rejecting = no backend session / not admin.
  getSession: jest.fn(),
  // The four reads RaceSync makes against Race Replay's own endpoints;
  // defaulted below so route tests that land on /sync-f1-broadcast never
  // depend on the network answering.
  getFixtures: jest.fn(),
  // The driver/team records the Driver Analysis card introduces the focused
  // driver with — the same lists the driver and team pages read.
  getDrivers: jest.fn(),
  getTeams: jest.fn(),
  getRaceReplayState: jest.fn(),
  getRaceReplayTrackShape: jest.fn(),
  // The lap series the analysis panels under the map read: one fetch per
  // picked session, sliced at the playhead rather than re-fetched per lap.
  getRaceReplayLapSeries: jest.fn(),
  // The signed-in user's notifications — the header bell's own reads.
  getNotifications: jest.fn(),
  markNotificationRead: jest.fn(),
  // The verify-email page's two calls. It mails a code on arrival, so a test
  // that lands there needs an answer rather than a rejected network call.
  requestEmailVerificationCode: jest.fn(),
  confirmEmailVerificationCode: jest.fn(),
}));

// A stand-in for a real Firebase User. `devFlag` is a { value } ref so a
// test can flip it (simulating the backend having set the custom claim)
// and have the NEXT getIdTokenResult() call see the new value — same
// shape as the real round trip: toggle -> backend call -> forced refresh.
// `verifiedFlag` is the same trick for email_verified, which defaults to
// true because the guarded routes check it (see RequireAuth).
function fakeFirebaseUser(overrides = {}, devFlag = { value: false }, verifiedFlag = { value: true }) {
  return {
    uid: 'u1',
    ...overrides,
    getIdTokenResult: jest.fn().mockImplementation(() =>
      Promise.resolve({
        claims: { developer: devFlag.value, email_verified: verifiedFlag.value },
      })
    ),
    // DeveloperModeContext fetches this to attach an explicit Authorization
    // header alongside the cookie when saving the toggle (see api/client.js).
    getIdToken: jest.fn().mockResolvedValue('fake-id-token'),
  };
}

function emitAuthState(user) {
  // Real Firebase keeps auth.currentUser in sync with the signed-in user;
  // the mock doesn't do that for us, so mirror it here — AuthContext's
  // refreshDeveloperMode() reads auth.currentUser directly.
  auth.currentUser = user ?? null;
  act(() => {
    authCallback(user);
  });
}

// Settings is a tab on the Profile page now, not its own nav item.
async function openSettingsTab() {
  fireEvent.click(getTopNavLink('Profile'));
  fireEvent.click(await screen.findByRole('tab', { name: 'Settings' }));
  await waitFor(() => expect(screen.getByText('Developer mode')).toBeInTheDocument());
}

function getTopNavLink(name) {
  // The persistent top nav is the only region with aria-label="Main navigation".
  const topnav = screen.getByLabelText('Main navigation');
  const links = Array.from(topnav.querySelectorAll('a'));
  return links.find((a) => a.textContent.trim() === name);
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.pushState({}, '', '/');
  auth.currentUser = null;
  setDeveloperModeOnServer.mockReset();
  getSession.mockReset();
  getSession.mockRejectedValue(new Error('no backend session'));
  getFixtures.mockReset();
  getFixtures.mockResolvedValue({ fixtures: [] });
  getDrivers.mockReset();
  getDrivers.mockRejectedValue(new Error('no drivers list'));
  getTeams.mockReset();
  getTeams.mockRejectedValue(new Error('no teams list'));
  getRaceReplayState.mockReset();
  getRaceReplayState.mockRejectedValue(new Error('no replay state'));
  getRaceReplayTrackShape.mockReset();
  getRaceReplayTrackShape.mockRejectedValue(new Error('no track outline'));
  getRaceReplayLapSeries.mockReset();
  getRaceReplayLapSeries.mockRejectedValue(new Error('no lap series'));
  getNotifications.mockReset();
  getNotifications.mockRejectedValue(new Error('no notifications'));
  markNotificationRead.mockReset();
  markNotificationRead.mockResolvedValue({});
  requestEmailVerificationCode.mockReset();
  requestEmailVerificationCode.mockResolvedValue({
    status: 'sent',
    email: 'ne***@example.test',
    expiresInMinutes: 10,
    resendAfterSeconds: 60,
  });
  confirmEmailVerificationCode.mockReset();
});

test('renders the welcome page by default, with the persistent top nav', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'F1 lytics' })).toBeInTheDocument();
  expect(screen.getByLabelText('Main navigation')).toBeInTheDocument();
});

// RaceSync carries its own local section rail instead of the app's top nav.
// It is visible by default and the toggle inside it collapses it to a slim
// strip. Its rows jump to the readings on the page — or state honestly why
// they can't: no race picked yet, or no data behind the section at all.
test('shows the RaceSync local navigation by default and collapses it from its own toggle', () => {
  const { unmount } = render(<App />);
  // Nothing like it on the app's other pages — the top bar stays put.
  expect(screen.queryByLabelText('RaceSync sections')).not.toBeInTheDocument();
  unmount();

  window.history.pushState({}, '', '/sync-f1-broadcast');
  render(<App />);

  const localNav = screen.getByLabelText('RaceSync sections');
  expect(within(localNav).getByText('Race Overview')).toBeInTheDocument();
  expect(within(localNav).getByText('Strategy & Pit Stops')).toBeInTheDocument();
  expect(within(localNav).getByText('Reports')).toBeInTheDocument();

  // The way back to the app is wired up, as are the section rows.
  expect(
    within(localNav).getByRole('link', { name: 'Back to TelemetryTV' })
  ).toHaveAttribute('href', '/telemetry-tv');

  // The overview row jumps even with nothing picked — the no-race guide
  // carries its anchor. jsdom has no real scrolling, so the assertion is the
  // call itself, not where the page ended up.
  const proto = window.HTMLElement.prototype;
  const scrollIntoView = proto.scrollIntoView;
  proto.scrollIntoView = jest.fn();
  fireEvent.click(within(localNav).getByRole('button', { name: 'Race Overview' }));
  expect(proto.scrollIntoView).toHaveBeenCalledTimes(1);
  proto.scrollIntoView = scrollIntoView;

  // The reading rows have nowhere to land until a race is picked, so they
  // wait — muted, and saying so under their labels.
  expect(
    within(localNav).getByRole('button', { name: /Lap Time Analysis/ })
  ).toHaveAttribute('aria-disabled', 'true');
  expect(within(localNav).getAllByText('pick a race first')).toHaveLength(4);

  // …and the rows with no data behind them at all carry their reason.
  const telemetryRow = within(localNav).getByRole('button', { name: /Telemetry/ });
  expect(telemetryRow).toHaveAttribute('aria-disabled', 'true');
  expect(telemetryRow).toHaveAttribute(
    'title',
    'No speed, brake, throttle or gear channels exist for any synced session'
  );
  expect(within(localNav).getByText('no channel data')).toBeInTheDocument();

  // The hamburger lives inside the rail and collapses it.
  fireEvent.click(
    within(localNav).getByRole('button', { name: 'Collapse RaceSync navigation' })
  );
  const expandToggle = within(localNav).getByRole('button', {
    name: 'Expand RaceSync navigation',
  });
  expect(expandToggle).toHaveAttribute('aria-expanded', 'false');

  // …and the same toggle brings the rail back.
  fireEvent.click(expandToggle);
  expect(
    within(localNav).getByRole('button', { name: 'Collapse RaceSync navigation' })
  ).toHaveAttribute('aria-expanded', 'true');
});

// The RaceSync page carries its own branded header instead of the app's red
// top nav (see raceSync.css). The bell belongs to the signed-in account, so
// with no session there is none; the chip on the right is the map's view
// menu (see RaceSyncViewMenu).
test('shows the branded RaceSync header on the RaceSync page only', () => {
  const { unmount } = render(<App />);
  expect(
    screen.queryByRole('button', { name: 'Choose what to see' })
  ).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText('Type Race Title...')).not.toBeInTheDocument();
  unmount();

  window.history.pushState({}, '', '/sync-f1-broadcast');
  render(<App />);

  expect(screen.getByText('Observe, Diagnose, Simulate')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Type Race Title...')).toBeInTheDocument();
  // Notifications belong to the signed-in account — no session, no bell.
  expect(screen.queryByRole('button', { name: /Notifications/ })).not.toBeInTheDocument();
  // The chip is a prompt until the map is scoped (covered in the stage test).
  expect(
    screen.getByRole('button', { name: 'Choose what to see' })
  ).toBeInTheDocument();
  // The wordmark is split so "Sync" can carry the F1 red.
  expect(screen.getByText('Race')).toBeInTheDocument();
  expect(screen.getByText('Sync')).toBeInTheDocument();
});

// The bell on the RaceSync header reads the account's own notifications, and
// reading one is what dismisses it — the same endpoint and the same account
// menu the app's own top nav serves.
test('the RaceSync bell lists the signed-in user’s notifications and marks them read', async () => {
  window.history.pushState({}, '', '/sync-f1-broadcast');
  getNotifications.mockResolvedValue([
    {
      id: 'n1',
      title: 'Ver wins Monza',
      message: 'Max Verstappen won the Italian Grand Prix.',
      isRead: false,
      createdAt: new Date(Date.now() - 3 * 60000).toISOString(),
    },
    {
      id: 'n2',
      title: 'Welcome to RaceSync',
      message: 'Observe, diagnose, simulate.',
      isRead: true,
      createdAt: new Date(Date.now() - 26 * 3600000).toISOString(),
    },
  ]);
  render(<App />);
  await act(async () => {
    auth.currentUser = fakeFirebaseUser({ uid: 'boss' });
    authCallback(auth.currentUser);
  });

  // The unread count is the bell's own name, and the list loads with the
  // session that owns it.
  const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
  expect(getNotifications).toHaveBeenCalledTimes(1);

  fireEvent.click(bell);
  // Opening re-reads, so a notification that arrived while the page was open
  // still shows the moment the bell is used.
  expect(getNotifications).toHaveBeenCalledTimes(2);
  expect(await screen.findByText('Ver wins Monza')).toBeInTheDocument();
  expect(screen.getByText('Welcome to RaceSync')).toBeInTheDocument();
  expect(screen.getByText('3m ago')).toBeInTheDocument();
  expect(screen.getByText('1d ago')).toBeInTheDocument();

  // Clicking an unread row is what reads it — first on screen, then on the
  // server. A read row is text, not a control.
  fireEvent.click(screen.getByRole('button', { name: /Ver wins Monza/ }));
  expect(markNotificationRead).toHaveBeenCalledWith('n1');
  expect(
    await screen.findByRole('button', { name: 'Notifications' })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /Ver wins Monza/ })
  ).not.toBeInTheDocument();

  // The way to the whole list is the profile, as in the app's own nav.
  expect(screen.getByRole('link', { name: 'View all in Profile' })).toHaveAttribute(
    'href',
    '/profile'
  );
});

// The header's race search is wired to the same races Race Replay offers
// (replay-ready fixtures only), and picking one loads that session's real
// trace, driver field and race band into the centre stage from the shared
// read-only endpoints. The view menu beside it then narrows that stage.
test('the RaceSync header search loads the picked race and the view menu narrows the map', async () => {
  window.history.pushState({}, '', '/sync-f1-broadcast');
  getFixtures.mockResolvedValue({
    fixtures: [
      {
        id: 's-italy',
        meetingName: 'Italian Grand Prix',
        season: 2021,
        type: 'Race',
        circuitName: 'Monza',
        country: 'Italy',
        startTime: '2021-09-12T13:00:00Z',
        replayReady: true,
      },
      {
        id: 's-britain',
        meetingName: 'British Grand Prix',
        season: 2021,
        type: 'Race',
        circuitName: 'Silverstone',
        country: 'United Kingdom',
        startTime: '2021-07-18T14:00:00Z',
        replayReady: true,
      },
      {
        id: 's-spain',
        meetingName: 'Spanish Grand Prix',
        season: 2021,
        type: 'Qualifying',
        replayReady: false,
      },
    ],
  });
  getRaceReplayTrackShape.mockResolvedValue({
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 60 },
      { x: 0, y: 60 },
    ],
  });
  const field = [
    { entryId: 'e1', driverName: 'Max VERSTAPPEN', teamName: 'Red Bull Racing' },
    { entryId: 'e2', driverName: 'Lewis HAMILTON', teamName: 'Mercedes' },
  ];
  // Lap-aware, the way the real endpoint is: it reports whichever lap was
  // asked for, and only calls it the end once that lap is the last one. The
  // first race carries a weather reading (so the band's chips render) and the
  // second carries none (so the band is checked to leave them out rather than
  // invent them).
  getRaceReplayState.mockImplementation(async (sessionId, { lap } = {}) =>
    sessionId === 's-italy'
      ? {
          lap,
          totalLaps: 53,
          atEnd: lap >= 53,
          weather: {
            airTemperature: 18.4,
            trackTemperature: 23.2,
            humidity: 6,
            rainfall: 0,
          },
          leaderboard: field,
        }
      // A short race on purpose: with no skip control in the band's transport,
      // a three-lap fixture puts the end of the race a few steps away instead
      // of a minute of ticking.
      : { lap, totalLaps: 3, atEnd: lap >= 3, leaderboard: field }
  );
  // The lap series those panels read, in the endpoint's own shape: one column
  // per measure per driver, indexed by lap - 1. Both races carry the map's own
  // two drivers, with a stop apiece in Italy — VER loses a place over his and
  // HAM takes it — and no stops at all in Britain. The times carry a small
  // repeating wobble so that no two laps are identical.
  getRaceReplayLapSeries.mockImplementation(async (sessionId) => {
    const totalLaps = sessionId === 's-italy' ? 53 : 3;
    const laps = Array.from({ length: totalLaps }, (_, index) => index + 1);
    const times = (base) => laps.map((lap) => base + (lap % 5) * 0.12);
    // One column per measure, before and after the stop — or all before when
    // the race has no stop (a null lap never triggers the after value).
    const acrossStop = (stopLap, before, after) =>
      laps.map((lap) => (stopLap && lap >= stopLap ? after : before));
    const stintNumber = (stopLap) => laps.map((lap) => (stopLap && lap >= stopLap ? 2 : 1));
    const verStop = sessionId === 's-italy' ? 12 : null;
    const hamStop = sessionId === 's-italy' ? 11 : null;
    return {
      sessionId,
      totalLaps,
      drivers: [
        {
          entryId: 'e1',
          driverName: 'Max VERSTAPPEN',
          teamName: 'Red Bull Racing',
          lapTimeSeconds: times(90.8),
          position: acrossStop(verStop, 1, 2),
          compound: acrossStop(verStop, 'SOFT', 'HARD'),
          stintNumber: stintNumber(verStop),
        },
        {
          entryId: 'e2',
          driverName: 'Lewis HAMILTON',
          teamName: 'Mercedes',
          lapTimeSeconds: times(91.2),
          position: acrossStop(hamStop, 2, 1),
          compound: acrossStop(hamStop, 'MEDIUM', 'HARD'),
          stintNumber: stintNumber(hamStop),
        },
      ],
    };
  });
  // The Driver Analysis card introduces its driver with the app's own records:
  // the drivers list for the headshot, the teams list for the badge.
  getDrivers.mockResolvedValue({
    drivers: [
      { id: 'd-ver', name: 'Max Verstappen', imageUrl: 'https://openf1.example/ver.png' },
      { id: 'd-ham', name: 'Lewis Hamilton', imageUrl: 'https://openf1.example/ham.png' },
    ],
  });
  getTeams.mockResolvedValue({
    teams: [
      { name: 'Red Bull Racing', logoUrl: 'https://cdn.example/rb.png' },
      { name: 'Mercedes', logoUrl: 'https://cdn.example/merc.png' },
    ],
  });

  render(<App />);

  // Nothing is picked by default: the map carries the workspace instructions
  // and no replay data is fetched until a race is chosen.
  expect(screen.getByLabelText('How to use RaceSync')).toBeInTheDocument();
  expect(screen.getByText('Pick a race above to load its replay.')).toBeInTheDocument();
  expect(screen.getByText('Don’t just watch the race. Read it.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Circuit map and driver positions')).not.toBeInTheDocument();
  // The workflow spine belongs to a picked race too — it leaves with the guide.
  expect(screen.queryByRole('group', { name: 'Race workflow' })).not.toBeInTheDocument();
  expect(getRaceReplayTrackShape).not.toHaveBeenCalled();
  expect(getRaceReplayState).not.toHaveBeenCalled();
  expect(getRaceReplayLapSeries).not.toHaveBeenCalled();

  // Typing here opens the list of synced races; only the replay-ready
  // sessions are offered — Race Replay's own filter.
  const search = screen.getByPlaceholderText('Type Race Title...');
  fireEvent.focus(search);
  const italy = await screen.findByRole('option', { name: /Italian Grand Prix 2021/ });
  expect(screen.queryByRole('option', { name: /Spanish Grand Prix/ })).not.toBeInTheDocument();

  // Picking a row closes the list and replaces the instructions with that
  // session's real trace, driver field and race band.
  fireEvent.click(italy);
  const stage = await screen.findByLabelText('Circuit map and driver positions');
  expect(screen.queryByLabelText('How to use RaceSync')).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /Italian Grand Prix 2021/ })).not.toBeInTheDocument();
  // The marker only appears once BOTH fetches have landed (the trace and the
  // leaderboard), so this waits for the whole stage. A picked race opens
  // parked on lap 0 — the red mark's Play button is the only thing that starts
  // this race, which is what this page asks of the shared engine.
  await within(stage).findByText('VER', { selector: '.racesync-stage-car' });
  expect(getRaceReplayState).toHaveBeenCalledWith('s-italy', { lap: 0 });
  // The panels under the map read the same race from one series per session —
  // fetched once, not per lap — and parked on the grid there are no laps to
  // read, which every series-based panel says rather than drawing an empty
  // frame.
  expect(getRaceReplayLapSeries).toHaveBeenCalledWith('s-italy');
  expect(getRaceReplayLapSeries).toHaveBeenCalledTimes(1);
  expect((await within(stage).findAllByText('No laps run yet.')).length).toBeGreaterThan(0);

  // The Driver Analysis card is one of those panels — parked on the grid it
  // has no metrics either — and it introduces the field's first driver (no
  // one has led a lap yet) with the same records the driver and team pages
  // serve: Verstappen's headshot routed through the image proxy, the Red
  // Bull badge beside his name.
  const analysis = () => within(stage).getByRole('region', { name: 'Driver Analysis' });
  expect(within(analysis()).getByText('No laps run yet.')).toBeInTheDocument();
  expect(
    await within(analysis()).findByRole('img', { name: 'Max Verstappen' })
  ).toHaveAttribute('src', expect.stringContaining('/api/images?source='));
  expect(within(analysis()).getByRole('img', { name: 'Red Bull Racing' })).toHaveAttribute(
    'src',
    'https://cdn.example/rb.png'
  );

  // A picked race is also what the rail was waiting on: the reading rows stop
  // waiting and become jumps to the panels that now exist.
  expect(
    screen.getByRole('button', { name: /Lap Time Analysis/ })
  ).not.toHaveAttribute('aria-disabled');

  // The map zooms on the frame's own terms, without touching the replay: the
  // cluster's buttons zoom around the centre, the readout says where the view
  // stands, and the reset hands the fitted view back. (The drag is a
  // real-browser gesture — the e2e spec covers it.)
  const zoomGroup = within(stage).getByRole('group', { name: 'Map zoom' });
  expect(within(zoomGroup).getByText('1.0×')).toBeInTheDocument();
  fireEvent.click(within(zoomGroup).getByRole('button', { name: 'Zoom the map in' }));
  expect(within(zoomGroup).getByText('1.6×')).toBeInTheDocument();
  fireEvent.click(within(zoomGroup).getByRole('button', { name: 'Reset the map view' }));
  expect(within(zoomGroup).getByText('1.0×')).toBeInTheDocument();
  expect(within(zoomGroup).getByRole('button', { name: 'Reset the map view' })).toBeDisabled();
  expect(within(zoomGroup).getByRole('button', { name: 'Zoom the map out' })).toBeDisabled();

  // The wheel listener rides the map card itself rather than the session: the
  // card is re-created under the readings' grid when the lap series lands (the
  // panels above are already reading it by this point), so a listener welded
  // to the node the pick created would be gone with that node. A synthetic
  // wheel on a marker inside the card bubbles to the card the listener rides,
  // so the zoom answering proves the listener followed the node — the real
  // gesture is the e2e spec's to make.
  const carMarker = within(stage).getByText('VER', { selector: '.racesync-stage-car' });
  fireEvent.wheel(carMarker, { ctrlKey: true, deltaY: -240 });
  fireEvent.wheel(carMarker, { ctrlKey: true, deltaY: -240 });
  expect(within(zoomGroup).getByText('2.6×')).toBeInTheDocument();
  fireEvent.click(within(zoomGroup).getByRole('button', { name: 'Reset the map view' }));
  expect(within(zoomGroup).getByText('1.0×')).toBeInTheDocument();

  // The export waits with the panels: parked on the grid there are no laps to
  // export, so the button is out until the replay has run one.
  expect(within(stage).getByRole('button', { name: 'Export CSV' })).toBeDisabled();

  // The lap chip reads the playhead out and is also the jump box, so its
  // number lives in the field's own value rather than in a text node: this is
  // the one way the flow below reads which lap the stage has landed on.
  const findLap = (lapNumber) => within(stage).findByDisplayValue(String(lapNumber));

  // Two more shorthand readers for the panels under the map, so the
  // assertions about them read as what they say rather than as markup. The
  // pace values are read as the lap times they are, in the order the panel
  // lists them — quickest first.
  const panel = (name) => within(stage).getByRole('region', { name });
  const paceValues = () =>
    within(panel('Pace & Key Metrics'))
      .getAllByText(/^\d:\d{2}\.\d{3}$/, { selector: '.racesync-pace-value' })
      .map((cell) => cell.textContent);

  // The band carries the race itself: flag, name, place, date and type…
  expect(within(stage).getByRole('img', { name: 'Italy' })).toBeInTheDocument();
  expect(within(stage).getByRole('heading', { name: 'Italian Grand Prix' })).toBeInTheDocument();
  expect(within(stage).getByText('Monza · Italy · 12 Sep 2021 · Race')).toBeInTheDocument();
  // …then how far along it is and what the track was doing. The lap chip still
  // reads "Lap 0 / 53" — the number in the middle is simply a field now.
  expect(within(stage).getByLabelText('Lap')).toBeInTheDocument();
  expect(await findLap(0)).toBeInTheDocument();
  expect(within(stage).getByText('/ 53')).toBeInTheDocument();
  expect(within(stage).getByText('Time remaining')).toBeInTheDocument();
  expect(within(stage).getByText('53 Laps')).toBeInTheDocument();
  expect(within(stage).getByText('23°C')).toBeInTheDocument();
  expect(within(stage).getByText('Track Temp')).toBeInTheDocument();
  expect(within(stage).getByText('18°C')).toBeInTheDocument();
  expect(within(stage).getByText('6%')).toBeInTheDocument();
  expect(within(stage).getByText('Dry')).toBeInTheDocument();
  // The field is the session's real leaderboard: codes are derived from the
  // driver names and colours come from the shared team palette.
  expect(
    within(stage).getByText('VER', { selector: '.racesync-stage-car' })
  ).toHaveClass('racesync-car-redbull');
  expect(
    within(stage).getByText('VER', { selector: '.racesync-stage-legend-code' })
  ).toBeInTheDocument();
  expect(
    within(stage).getByText('Max Verstappen', { selector: '.racesync-stage-legend-name' })
  ).toBeInTheDocument();
  expect(
    within(stage).getByText('Lewis Hamilton', { selector: '.racesync-stage-legend-name' })
  ).toBeInTheDocument();

  // Under the readings, the workflow spine names the page's three phases.
  // The active step is the last one jumped to; Simulate has no data behind
  // it yet and says so instead of pretending — the rail's honesty rule.
  const spine = within(stage).getByRole('group', { name: 'Race workflow' });
  const observeStep = within(spine).getByRole('button', { name: /What happened\?/ });
  const diagnoseStep = within(spine).getByRole('button', { name: /Why did it happen\?/ });
  expect(observeStep).toHaveAttribute('aria-current', 'step');
  const simulateStep = within(spine).getByRole('button', { name: /What if we changed it\?/ });
  expect(simulateStep).toHaveAttribute('aria-disabled', 'true');
  expect(simulateStep).toHaveAttribute(
    'title',
    'Counterfactuals need data this page doesn’t have yet — nothing here simulates a changed race'
  );
  expect(within(spine).getByText('no simulation data')).toBeInTheDocument();

  // Jumping to Diagnose moves the red step marker and scrolls the pace
  // reading into view — jsdom has no real scrolling, so the assertion is the
  // call itself, not where the page ended up.
  const proto = window.HTMLElement.prototype;
  const scrollIntoView = proto.scrollIntoView;
  proto.scrollIntoView = jest.fn();
  fireEvent.click(diagnoseStep);
  expect(proto.scrollIntoView).toHaveBeenCalledTimes(1);
  proto.scrollIntoView = scrollIntoView;
  expect(diagnoseStep).toHaveAttribute('aria-current', 'step');
  expect(observeStep).not.toHaveAttribute('aria-current');

  // The spine carries the replay's whole transport — chevrons around the
  // type-in lap chip, pause, speed and the red replay mark — riding Race
  // Replay's own lap clock. It opens parked: nothing plays until the red
  // mark is pressed, the back step is off on the grid, and the lap chip
  // reads the playhead's lap back.
  const lapField = within(spine).getByLabelText('Lap');
  expect(lapField).toHaveValue('0');
  expect(within(spine).getByText('/ 53')).toBeInTheDocument();
  expect(within(spine).getByRole('button', { name: 'Back one lap' })).toBeDisabled();
  expect(
    within(spine).getByRole('button', { name: 'Forward one lap' })
  ).toBeEnabled();
  expect(within(spine).getByRole('button', { name: 'Play the race' })).toHaveTextContent('Play');
  fireEvent.click(within(spine).getByRole('button', { name: 'Forward one lap' }));
  expect(await findLap(1)).toBeInTheDocument();
  expect(lapField).toHaveValue('1');
  fireEvent.click(within(spine).getByRole('button', { name: 'Back one lap' }));
  expect(await findLap(0)).toBeInTheDocument();

  // Playing starts the race — the engine ticks straight into lap 1 so the
  // first lap is not a full tick away, the same behaviour Race Replay's viewer
  // has — and the red mark reads Restart while the race runs.
  fireEvent.click(within(spine).getByRole('button', { name: 'Play the race' }));
  expect(await findLap(1)).toBeInTheDocument();
  expect(
    within(spine).getByRole('button', { name: 'Restart the race' })
  ).toHaveTextContent('Restart');
  expect(within(stage).getByText('52 Laps')).toBeInTheDocument();

  // The chevrons step a lap at a time on that same clock, and a step re-loads
  // the stage for the lap it lands on.
  fireEvent.click(within(stage).getByRole('button', { name: 'Forward one lap' }));
  expect(await findLap(2)).toBeInTheDocument();
  expect(getRaceReplayState).toHaveBeenCalledWith('s-italy', { lap: 2 });
  // The panels have followed to lap 2: a fastest lap per driver, quickest
  // first, and no stop has happened yet for the pit panel to report.
  expect(paceValues()).toEqual(['1:30.920', '1:31.320']);
  expect(within(panel('Pit Stops')).getByText('No stops yet.')).toBeInTheDocument();
  expect(within(stage).getByRole('button', { name: 'Back one lap' })).toBeEnabled();
  fireEvent.click(within(stage).getByRole('button', { name: 'Back one lap' }));
  expect(await findLap(1)).toBeInTheDocument();

  // The lap chip is a jump box as well as a readout: typing a lap into it and
  // confirming sends a running replay there without stopping it.
  fireEvent.change(lapField, { target: { value: '40' } });
  fireEvent.keyDown(lapField, { key: 'Enter' });
  expect(await findLap(40)).toBeInTheDocument();
  expect(getRaceReplayState).toHaveBeenCalledWith('s-italy', { lap: 40 });
  // Jumping to lap 40 reloads the leaderboard but never the series: one fetch
  // for the session is still all the panels have needed.
  expect(getRaceReplayLapSeries).toHaveBeenCalledTimes(1);
  // Forty laps are on the page, so forty are exportable — the file is cut at
  // the same playhead the panels are. (The download itself is a real-browser
  // gesture; the e2e spec takes it.)
  expect(within(stage).getByRole('button', { name: 'Export CSV' })).toBeEnabled();

  // Both stops are in, one place lost over VER's and one won over HAM's, and
  // both wide charts drew — each labelled for what it plots, with the delta
  // chart's axis reading the playhead's own lap out.
  const stopsPanel = panel('Pit Stops');
  expect(within(stopsPanel).getByText('L12')).toBeInTheDocument();
  expect(within(stopsPanel).getByText('L11')).toBeInTheDocument();
  expect(within(stopsPanel).getByText('-1')).toHaveClass('is-loss');
  expect(within(stopsPanel).getByText('+1')).toHaveClass('is-gain');
  expect(
    within(panel('Lap Time Delta')).getByRole('img', { name: /lap time delta/i })
  ).toBeInTheDocument();
  expect(
    within(panel('Twin Line')).getByRole('img', { name: /lap times/i })
  ).toBeInTheDocument();
  expect(within(panel('Lap Time Delta')).getByText('Lap 40')).toBeInTheDocument();
  expect(within(stage).getByText('13 Laps')).toBeInTheDocument();

  // The Driver Analysis card reads the lap-40 leader in depth, introduced by
  // the app's own records — Hamilton's headshot through the image proxy and
  // the Mercedes badge beside his name — and the mockup's tiles as the synced
  // data honestly supports them: average pace against the field's best
  // average, the best lap and its number, the latest stint's wear read
  // against its own pace, and the stint lengths with the stop count.
  const leaderCard = within(stage).getByRole('region', { name: 'Driver Analysis' });
  expect(
    within(leaderCard).getByRole('heading', { name: 'Lewis Hamilton' })
  ).toBeInTheDocument();
  expect(within(leaderCard).getByRole('img', { name: 'Lewis Hamilton' })).toHaveAttribute(
    'src',
    expect.stringContaining('/api/images?source=')
  );
  expect(within(leaderCard).getByRole('img', { name: 'Mercedes' })).toHaveAttribute(
    'src',
    'https://cdn.example/merc.png'
  );
  expect(within(leaderCard).getByText('Avg pace')).toBeInTheDocument();
  expect(within(leaderCard).getByText('1:31.440')).toBeInTheDocument();
  expect(within(leaderCard).getByText('+0.400 to best avg')).toBeInTheDocument();
  expect(within(leaderCard).getByText('1:31.200')).toBeInTheDocument();
  expect(within(leaderCard).getByText('Lap 5')).toBeInTheDocument();
  expect(within(leaderCard).getByText('0.00% / lap')).toBeInTheDocument();
  expect(within(leaderCard).getByText('10 / 30')).toBeInTheDocument();
  expect(within(leaderCard).getByText('1 stop')).toBeInTheDocument();
  // The takeaways are true sentences about the numbers…
  expect(within(leaderCard).getByText('Gained +1 over the stop on L11')).toBeInTheDocument();
  expect(within(leaderCard).getByText('Best lap L5 — 1:31.200')).toBeInTheDocument();
  expect(
    within(leaderCard).getByText('Latest stint: no measurable tyre wear yet')
  ).toBeInTheDocument();
  // …and the recommended-strategy row stays honest: nothing on this page
  // simulates an alternate race, so the button is out.
  expect(within(leaderCard).getByText('no simulation data')).toBeInTheDocument();
  expect(within(leaderCard).getByRole('button', { name: 'Run Simulation' })).toBeDisabled();
  // Clicking away confirms too — a typed lap is never silently dropped…
  fireEvent.focus(lapField);
  fireEvent.change(lapField, { target: { value: '12' } });
  fireEvent.blur(lapField);
  expect(await findLap(12)).toBeInTheDocument();
  // …while Escape drops the edit and hands the readout back to the replay.
  fireEvent.focus(lapField);
  fireEvent.change(lapField, { target: { value: '30' } });
  fireEvent.keyDown(lapField, { key: 'Escape' });
  fireEvent.blur(lapField);
  expect(lapField).toHaveValue('12');

  // Paused, the red mark is Play again — a resume rather than a restart — and
  // the middle button is the way back in.
  fireEvent.click(within(stage).getByRole('button', { name: 'Pause the replay' }));
  expect(
    within(spine).getByRole('button', { name: 'Play the race' })
  ).toHaveTextContent('Play');
  expect(
    within(stage).getByRole('button', { name: 'Resume the replay' })
  ).toBeInTheDocument();

  // The speed button cycles the shared replay speeds, starting from the
  // "Default speed" preference — 1× out of the box.
  fireEvent.click(within(stage).getByRole('button', { name: 'Replay speed 1×' }));
  expect(
    within(stage).getByRole('button', { name: 'Replay speed 2×' })
  ).toBeInTheDocument();

  // The header's view menu scopes the map. Its lists come from the loaded
  // session's own field, so this picks a team that is really in the race.
  fireEvent.click(screen.getByRole('button', { name: 'Choose what to see' }));
  fireEvent.click(await screen.findByRole('option', { name: /Choose team/ }));
  fireEvent.click(await screen.findByRole('option', { name: /Red Bull Racing/ }));

  // The chip reads that scope back…
  expect(
    screen.getByRole('button', { name: 'What the map shows: Red Bull Racing' })
  ).toBeInTheDocument();
  // …and the map agrees with it: the Mercedes marker and legend row are gone
  // while the Red Bull ones stay.
  expect(
    within(stage).queryByText('HAM', { selector: '.racesync-stage-car' })
  ).not.toBeInTheDocument();
  expect(within(stage).queryByText('Lewis Hamilton')).not.toBeInTheDocument();
  // The panels obey the same scope as the map: no Mercedes reading is left
  // under it either, while the Red Bull ones are all still there.
  expect(
    within(stage).queryByText('HAM', { selector: '.racesync-panel-code' })
  ).not.toBeInTheDocument();
  expect(
    within(stage).getAllByText('VER', { selector: '.racesync-panel-code' }).length
  ).toBeGreaterThan(0);
  expect(
    within(stage).getByText('VER', { selector: '.racesync-stage-car' })
  ).toBeInTheDocument();
  expect(
    within(stage).getByText('Max Verstappen', { selector: '.racesync-stage-legend-name' })
  ).toBeInTheDocument();
  // The Driver Analysis card obeys the same scope as every other panel: one
  // Red Bull in view means Verstappen is the driver it reads in depth.
  expect(
    within(panel('Driver Analysis')).getByRole('heading', { name: 'Max Verstappen' })
  ).toBeInTheDocument();

  // A comparison is built row by row and applied as it is built, so the menu
  // stays open and the map follows every toggle.
  fireEvent.click(
    screen.getByRole('button', { name: 'What the map shows: Red Bull Racing' })
  );
  fireEvent.click(await screen.findByRole('option', { name: /Compare drivers/ }));
  fireEvent.click(await screen.findByRole('option', { name: /Max Verstappen/ }));
  expect(
    screen.getByRole('button', { name: 'What the map shows: VERSTAPPEN' })
  ).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('option', { name: /Lewis Hamilton/ }));
  expect(
    screen.getByRole('button', { name: 'What the map shows: VERSTAPPEN vs HAMILTON' })
  ).toBeInTheDocument();
  expect(
    within(stage).getByText('HAM', { selector: '.racesync-stage-car' })
  ).toBeInTheDocument();
  // "Done" only closes the menu; the comparison stays on the map.
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(
    screen.queryByRole('listbox', { name: 'Map view options' })
  ).not.toBeInTheDocument();

  // The roster column carries the same editing, so a car can be dropped and
  // put back without leaving the replay: − on its row, ＋ under the list.
  fireEvent.click(
    within(stage).getByRole('button', { name: 'Remove Lewis Hamilton from the map' })
  );
  expect(
    within(stage).queryByText('HAM', { selector: '.racesync-stage-car' })
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'What the map shows: VERSTAPPEN' })
  ).toBeInTheDocument();
  fireEvent.click(
    within(stage).getByRole('button', { name: 'Add Lewis Hamilton to the map' })
  );
  expect(
    within(stage).getByText('HAM', { selector: '.racesync-stage-car' })
  ).toBeInTheDocument();
  // …and the panels have the Mercedes reading back too.
  expect(
    within(stage).getAllByText('HAM', { selector: '.racesync-panel-code' }).length
  ).toBeGreaterThan(0);
  expect(
    screen.getByRole('button', { name: 'What the map shows: VERSTAPPEN vs HAMILTON' })
  ).toBeInTheDocument();

  // Typing narrows the list and Enter takes the row under the cursor, which
  // re-loads the stage for that session.
  fireEvent.change(search, { target: { value: 'british' } });
  fireEvent.keyDown(search, { key: 'Enter' });
  // The new race comes in parked on lap 0 as well — a switch no longer plays
  // by itself — and this fixture is three laps long, so the end of the race is
  // a few steps away rather than a minute of ticking.
  expect(await findLap(0)).toBeInTheDocument();
  expect(within(stage).getByRole('heading', { name: 'British Grand Prix' })).toBeInTheDocument();
  expect(within(stage).getByText('3 Laps')).toBeInTheDocument();
  expect(within(stage).getByRole('img', { name: 'United Kingdom' })).toBeInTheDocument();
  expect(getRaceReplayState).toHaveBeenCalledWith('s-britain', { lap: 0 });
  // The panels reload with the race rather than keeping the last race's
  // numbers, and the new session's series is fetched once, the same way.
  expect(getRaceReplayLapSeries).toHaveBeenCalledWith('s-britain');
  expect(getRaceReplayLapSeries).toHaveBeenCalledTimes(2);
  // This race has no synced weather reading, so the band shows none rather
  // than a guess.
  expect(within(stage).queryByText('Track Temp')).not.toBeInTheDocument();

  // Stepping to the last lap is the whole race: the forward step, the pause
  // button and the countdown all run out, "1 Lap" reads in the singular, and
  // the red mark is Play again — the only race left to play is this one.
  const step = within(stage).getByRole('button', { name: 'Forward one lap' });
  fireEvent.click(step);
  expect(await findLap(1)).toBeInTheDocument();
  expect(within(stage).getByText('2 Laps')).toBeInTheDocument();
  fireEvent.click(step);
  expect(await findLap(2)).toBeInTheDocument();
  expect(within(stage).getByText('1 Lap')).toBeInTheDocument();
  // The jump box answers a lap past the end of the race rather than refusing
  // it: asking this three-lap race for lap 9 lands on its last lap.
  const britainLapField = within(stage).getByLabelText('Lap');
  fireEvent.change(britainLapField, { target: { value: '9' } });
  fireEvent.keyDown(britainLapField, { key: 'Enter' });
  expect(await findLap(3)).toBeInTheDocument();
  // Three laps into Britain the panels are reading this race: one three-lap
  // set per driver, and no stops at all — Italy's two rows are gone.
  expect(within(stage).getAllByText('3 laps')).toHaveLength(2);
  expect(within(stage).getByText('No stops yet.')).toBeInTheDocument();
  expect(within(stage).getByText('0 Laps')).toBeInTheDocument();
  expect(within(stage).getByRole('button', { name: 'Forward one lap' })).toBeDisabled();
  expect(within(stage).getByRole('button', { name: 'Resume the replay' })).toBeDisabled();

  // Replay at the end plays the race from its first lap, and Restart is what
  // the red mark says while it runs.
  fireEvent.click(within(stage).getByRole('button', { name: 'Replay the race' }));
  expect(await findLap(1)).toBeInTheDocument();
  expect(
    within(stage).getByRole('button', { name: 'Restart the race' })
  ).toHaveTextContent('Restart');
  // Parked again so the scope assertions below stay off the clock.
  fireEvent.click(within(stage).getByRole('button', { name: 'Pause the replay' }));
  expect(
    within(stage).getByRole('button', { name: 'Play the race' })
  ).toHaveTextContent('Play');

  // A scope names drivers and teams of one session, so it cannot outlive a
  // race switch: the new race comes in on the whole field again.
  expect(
    await screen.findByRole('button', { name: 'Choose what to see' })
  ).toBeInTheDocument();
  expect(
    within(stage).getByText('HAM', { selector: '.racesync-stage-car' })
  ).toBeInTheDocument();

  // A team scope's − removes the team behind the row it sits on, and dropping
  // the last name hands the map back to the whole field.
  fireEvent.click(screen.getByRole('button', { name: 'Choose what to see' }));
  fireEvent.click(await screen.findByRole('option', { name: /Choose team/ }));
  fireEvent.click(await screen.findByRole('option', { name: /Red Bull Racing/ }));
  expect(
    screen.getByRole('button', { name: 'What the map shows: Red Bull Racing' })
  ).toBeInTheDocument();
  fireEvent.click(
    within(stage).getByRole('button', { name: 'Remove Red Bull Racing from the map' })
  );
  // An emptied list reads as the whole race rather than as the prompt: the
  // mode is still something the user chose.
  expect(
    screen.getByRole('button', { name: 'What the map shows: Whole race' })
  ).toBeInTheDocument();
  expect(
    within(stage).getByText('HAM', { selector: '.racesync-stage-car' })
  ).toBeInTheDocument();
  // This one flow drives the whole page — a lap-by-lap map plus six panels of
  // readings — and every assertion above scans that whole DOM, which is more
  // than Jest's 5s default leaves room for once the rest of the suite is
  // running beside it. The flow's real runtime measures 15–35s depending on
  // machine load, so the budget is well clear of the measured range rather
  // than sitting on its edge.
}, 90000);

test('signed-out users can view Overview without signing in', async () => {
  render(<App />);
  emitAuthState(null);

  // Navigate to Overview using the top nav link.
  fireEvent.click(getTopNavLink('Overview'));

  await waitFor(() => expect(screen.getAllByText(/Overview/i).length).toBeGreaterThan(0));
  expect(screen.queryByRole('heading', { name: /^sign in$/i })).not.toBeInTheDocument();
});

test('signed-out users never see links to Submissions, Datasets, Developer, or Admin', async () => {
  render(<App />);
  emitAuthState(null);

  fireEvent.click(getTopNavLink('Overview'));
  await waitFor(() => expect(screen.getAllByText(/Overview/i).length).toBeGreaterThan(0));

  expect(screen.queryByRole('link', { name: 'Submissions' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Datasets' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Developer' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
});

test('signed-in users see the logged-in nav links, and Submissions and Datasets are never nav links', async () => {
  render(<App />);
  emitAuthState(fakeFirebaseUser());

  fireEvent.click(getTopNavLink('Overview'));
  await waitFor(() => expect(screen.getAllByText(/Overview/i).length).toBeGreaterThan(0));

  expect(screen.getByRole('link', { name: 'Developer' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Profile' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  // Not on the backend's admin list.
  expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Submissions' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Datasets' })).not.toBeInTheDocument();
});

test('turning on developer mode from Profile → Settings unlocks the Datasets and Submit Code tabs on Developer', async () => {
  const devFlag = { value: false };
  setDeveloperModeOnServer.mockImplementation(async (enabled) => {
    devFlag.value = enabled;
    return { developer: enabled };
  });

  render(<App />);
  emitAuthState(fakeFirebaseUser({}, devFlag));

  fireEvent.click(getTopNavLink('Overview'));
  await waitFor(() => expect(screen.getAllByText(/Overview/i).length).toBeGreaterThan(0));

  await openSettingsTab();

  fireEvent.click(screen.getByRole('checkbox', { name: /toggle developer mode/i }));
  await waitFor(() => expect(screen.getByRole('checkbox', { name: /toggle developer mode/i })).toBeChecked());

  fireEvent.click(getTopNavLink('Developer'));
  expect(await screen.findByRole('tab', { name: 'Datasets' })).toBeInTheDocument();
  // "Submissions" was the old tab's label; the Developer page calls it
  // "Submit Code" now (its /datasets and /code-submissions slugs still
  // resolve to it — see DeveloperPage's TAB_ALIASES).
  expect(screen.getByRole('tab', { name: 'Submit Code' })).toBeInTheDocument();
  // They're tabs now, never nav links.
  expect(screen.queryByRole('link', { name: 'Submissions' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Datasets' })).not.toBeInTheDocument();
});

test('an admin (per the backend) sees the Admin link and can open the Admin page', async () => {
  getSession.mockResolvedValue({ uid: 'boss', admin: true });
  render(<App />);
  await act(async () => {
    auth.currentUser = fakeFirebaseUser({ uid: 'boss' });
    authCallback(auth.currentUser);
  });

  fireEvent.click(await waitFor(() => {
    const link = getTopNavLink('Admin');
    expect(link).toBeDefined();
    return link;
  }));

  // The Admin page's own masthead — the "Submitter accounts" card this used
  // to wait for was replaced when the page was rewired to the real
  // code-submission records.
  expect(await screen.findByText('System administration')).toBeInTheDocument();
});

test('a signed-in non-admin who goes straight to /admin by URL lands on Overview instead', async () => {
  window.history.pushState({}, '', '/admin');
  render(<App />);
  await act(async () => {
    auth.currentUser = fakeFirebaseUser();
    authCallback(auth.currentUser);
  });

  await waitFor(() => expect(window.location.pathname).toBe('/overview'));
  expect(screen.queryByText('System administration')).not.toBeInTheDocument();
});

test('a signed-out user who navigates straight to /submissions by URL is redirected to sign-in', async () => {
  window.history.pushState({}, '', '/submissions');
  render(<App />);
  emitAuthState(null);

  await waitFor(() =>
    expect(screen.getByRole('heading', { name: /^sign in$/i })).toBeInTheDocument()
  );
});

test('signed-in users reach the Overview dashboard, with the persistent top nav', async () => {
  render(<App />);
  emitAuthState(fakeFirebaseUser({ email: 'driver@example.com' }));

  fireEvent.click(getTopNavLink('Overview'));

  await waitFor(() => expect(screen.getAllByText(/Overview/i).length).toBeGreaterThan(0));
  expect(screen.getByLabelText('Main navigation')).toBeInTheDocument();
});

test('nav switches to the Developer explainer once signed in, before developer mode is on', async () => {
  render(<App />);
  emitAuthState(fakeFirebaseUser());

  fireEvent.click(getTopNavLink('Overview'));
  await waitFor(() => expect(screen.getAllByText(/Overview/i).length).toBeGreaterThan(0));

  fireEvent.click(screen.getByText('Developer'));
  expect(screen.getByText(/how to turn on developer mode/i)).toBeInTheDocument();
});

test('nav shows the full Developer console once developer mode is turned on', async () => {
  const devFlag = { value: false };
  setDeveloperModeOnServer.mockImplementation(async (enabled) => {
    devFlag.value = enabled;
    return { developer: enabled };
  });

  render(<App />);
  emitAuthState(fakeFirebaseUser({}, devFlag));

  fireEvent.click(getTopNavLink('Overview'));
  await waitFor(() => expect(screen.getAllByText(/Overview/i).length).toBeGreaterThan(0));

  await openSettingsTab();
  fireEvent.click(screen.getByRole('checkbox', { name: /toggle developer mode/i }));
  await waitFor(() => expect(screen.getByRole('checkbox', { name: /toggle developer mode/i })).not.toBeDisabled());

  fireEvent.click(screen.getByText('Developer'));
  expect(screen.getByText(/API endpoints/i)).toBeInTheDocument();
});

test('the hero banner\'s live fixture link works once signed in', async () => {
  render(<App />);
  emitAuthState(fakeFirebaseUser());

  expect(screen.getByRole('heading', { name: 'F1 lytics' })).toBeInTheDocument();
  fireEvent.click(screen.getByText('Open live fixture'));

  await waitFor(() => expect(screen.getByText('Event log')).toBeInTheDocument());
});

test('the nav theme button flips the theme and remembers it as a preference', () => {
  render(<App />);
  expect(document.documentElement.dataset.theme).toBe('dark');

  fireEvent.click(screen.getByTitle('Toggle dark mode'));

  expect(document.documentElement.dataset.theme).toBe('light');
  expect(JSON.parse(window.localStorage.getItem('f1-analytics-preferences')).theme).toBe('light');
});

test('applies saved density and reduce-motion preferences to the page', () => {
  window.localStorage.setItem(
    'f1-analytics-preferences',
    JSON.stringify({ density: 'compact', reduceMotion: true })
  );
  render(<App />);

  expect(document.documentElement.dataset.density).toBe('compact');
  expect(document.documentElement.dataset.reduceMotion).toBe('true');
});

// The verify-email route is the one guarded route an unverified account can
// open, and RequireAuth sends it there from every other one — the frontend
// half of the backend's requireVerifiedEmail gate.
test('an unverified account asking for a guarded route lands on the verify page with a code already sent', async () => {
  window.history.pushState({}, '', '/profile');
  render(<App />);
  await act(async () => {
    auth.currentUser = fakeFirebaseUser({ email: 'new@example.test' }, { value: false }, { value: false });
    authCallback(auth.currentUser);
  });

  await waitFor(() => expect(window.location.pathname).toBe('/verify-email'));
  expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeInTheDocument();
  // A code is mailed on arrival: no "send" click before anything happens.
  await waitFor(() => expect(requestEmailVerificationCode).toHaveBeenCalledTimes(1));
  expect(await screen.findByLabelText('Verification code')).toBeInTheDocument();
});
