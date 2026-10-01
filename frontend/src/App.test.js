import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import App from './App';
import { auth } from './firebase';
import {
  getFixtures,
  getRaceReplayState,
  getRaceReplayTrackShape,
  getSession,
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
  // The three reads RaceSync makes against Race Replay's own endpoints;
  // defaulted below so route tests that land on /sync-f1-broadcast never
  // depend on the network answering.
  getFixtures: jest.fn(),
  getRaceReplayState: jest.fn(),
  getRaceReplayTrackShape: jest.fn(),
}));

// A stand-in for a real Firebase User. `devFlag` is a { value } ref so a
// test can flip it (simulating the backend having set the custom claim)
// and have the NEXT getIdTokenResult() call see the new value — same
// shape as the real round trip: toggle -> backend call -> forced refresh.
function fakeFirebaseUser(overrides = {}, devFlag = { value: false }) {
  return {
    uid: 'u1',
    ...overrides,
    getIdTokenResult: jest.fn().mockImplementation(() =>
      Promise.resolve({ claims: { developer: devFlag.value } })
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
  getRaceReplayState.mockReset();
  getRaceReplayState.mockRejectedValue(new Error('no replay state'));
  getRaceReplayTrackShape.mockReset();
  getRaceReplayTrackShape.mockRejectedValue(new Error('no track outline'));
});

test('renders the welcome page by default, with the persistent top nav', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'F1 lytics' })).toBeInTheDocument();
  expect(screen.getByLabelText('Main navigation')).toBeInTheDocument();
});

// RaceSync carries its own local section rail instead of the app's top nav.
// It is visible by default and the toggle inside it collapses it to a slim
// strip. The eight sections are placeholders for now.
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

  // The way back to the app is wired up, unlike the section placeholders.
  expect(
    within(localNav).getByRole('link', { name: 'Back to TelemetryTV' })
  ).toHaveAttribute('href', '/telemetry-tv');

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
// top nav (see raceSync.css). The bell is still a placeholder; the chip on the
// right is the map's view menu (see RaceSyncViewMenu).
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
  // The chip is a prompt until the map is scoped (covered in the stage test).
  expect(
    screen.getByRole('button', { name: 'Choose what to see' })
  ).toBeInTheDocument();
  // The wordmark is split so "Sync" can carry the F1 red.
  expect(screen.getByText('Race')).toBeInTheDocument();
  expect(screen.getByText('Sync')).toBeInTheDocument();
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

  render(<App />);

  // Nothing is picked by default: the map carries the workspace instructions
  // and no replay data is fetched until a race is chosen.
  expect(screen.getByLabelText('How to use RaceSync')).toBeInTheDocument();
  expect(screen.getByText('Pick a race above to load its replay.')).toBeInTheDocument();
  expect(screen.getByText('Don’t just watch the race. Read it.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Circuit map and driver positions')).not.toBeInTheDocument();
  expect(getRaceReplayTrackShape).not.toHaveBeenCalled();
  expect(getRaceReplayState).not.toHaveBeenCalled();

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

  // The lap chip reads the playhead out and is also the jump box, so its
  // number lives in the field's own value rather than in a text node: this is
  // the one way the flow below reads which lap the stage has landed on.
  const findLap = (lapNumber) => within(stage).findByDisplayValue(String(lapNumber));

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
  expect(within(stage).getByText('Max Verstappen')).toBeInTheDocument();
  expect(within(stage).getByText('Lewis Hamilton')).toBeInTheDocument();

  // The band's transport drives the replay on Race Replay's own clock, and it
  // opens parked: nothing plays until the red mark is pressed.
  const play = within(stage).getByRole('button', { name: 'Play the replay' });
  expect(play).toHaveTextContent('Play');
  expect(within(stage).getByRole('button', { name: 'Back one lap' })).toBeDisabled();
  expect(
    within(stage).getByRole('button', { name: 'Forward one lap' })
  ).toBeEnabled();

  // Playing starts the race — the engine ticks straight into lap 1 so the
  // first lap is not a full tick away, the same behaviour Race Replay's viewer
  // has — and the red mark reads Restart while the race runs.
  fireEvent.click(play);
  expect(await findLap(1)).toBeInTheDocument();
  expect(
    within(stage).getByRole('button', { name: 'Restart the replay' })
  ).toHaveTextContent('Restart');
  expect(within(stage).getByText('52 Laps')).toBeInTheDocument();

  // The chevrons step a lap at a time on that same clock, and a step re-loads
  // the stage for the lap it lands on.
  fireEvent.click(within(stage).getByRole('button', { name: 'Forward one lap' }));
  expect(await findLap(2)).toBeInTheDocument();
  expect(getRaceReplayState).toHaveBeenCalledWith('s-italy', { lap: 2 });
  expect(within(stage).getByRole('button', { name: 'Back one lap' })).toBeEnabled();
  fireEvent.click(within(stage).getByRole('button', { name: 'Back one lap' }));
  expect(await findLap(1)).toBeInTheDocument();

  // The lap chip is a jump box as well as a readout: typing a lap into it and
  // confirming sends a running replay there without stopping it.
  const lapField = within(stage).getByLabelText('Lap');
  fireEvent.change(lapField, { target: { value: '40' } });
  fireEvent.keyDown(lapField, { key: 'Enter' });
  expect(await findLap(40)).toBeInTheDocument();
  expect(getRaceReplayState).toHaveBeenCalledWith('s-italy', { lap: 40 });
  expect(within(stage).getByText('13 Laps')).toBeInTheDocument();
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
    within(stage).getByRole('button', { name: 'Play the replay' })
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
  expect(
    within(stage).getByText('VER', { selector: '.racesync-stage-car' })
  ).toBeInTheDocument();
  expect(within(stage).getByText('Max Verstappen')).toBeInTheDocument();

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
  expect(within(stage).getByText('0 Laps')).toBeInTheDocument();
  expect(within(stage).getByRole('button', { name: 'Forward one lap' })).toBeDisabled();
  expect(within(stage).getByRole('button', { name: 'Resume the replay' })).toBeDisabled();

  // Play at the end replays the race from its first lap, and Restart is what
  // the red mark says while it runs.
  fireEvent.click(within(stage).getByRole('button', { name: 'Play the replay' }));
  expect(await findLap(1)).toBeInTheDocument();
  expect(
    within(stage).getByRole('button', { name: 'Restart the replay' })
  ).toHaveTextContent('Restart');
  // Parked again so the scope assertions below stay off the clock.
  fireEvent.click(within(stage).getByRole('button', { name: 'Pause the replay' }));
  expect(
    within(stage).getByRole('button', { name: 'Play the replay' })
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
});

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

test('turning on developer mode from Profile → Settings unlocks the Datasets and Submissions tabs on Developer', async () => {
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
  expect(screen.getByRole('tab', { name: 'Submissions' })).toBeInTheDocument();
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

  expect(await screen.findByText('Submitter accounts')).toBeInTheDocument();
});

test('a signed-in non-admin who goes straight to /admin by URL lands on Overview instead', async () => {
  window.history.pushState({}, '', '/admin');
  render(<App />);
  await act(async () => {
    auth.currentUser = fakeFirebaseUser();
    authCallback(auth.currentUser);
  });

  await waitFor(() => expect(window.location.pathname).toBe('/overview'));
  expect(screen.queryByText('Submitter accounts')).not.toBeInTheDocument();
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
