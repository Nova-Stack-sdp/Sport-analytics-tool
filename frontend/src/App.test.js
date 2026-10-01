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
// top nav (see raceSync.css). The bell and account block are placeholders.
test('shows the branded RaceSync header on the RaceSync page only', () => {
  const { unmount } = render(<App />);
  expect(screen.queryByText('Team Analytics')).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText('Type Race Title...')).not.toBeInTheDocument();
  unmount();

  window.history.pushState({}, '', '/sync-f1-broadcast');
  render(<App />);

  expect(screen.getByText('Observe, Diagnose, Simulate')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Type Race Title...')).toBeInTheDocument();
  expect(screen.getByText('Team Analytics')).toBeInTheDocument();
  // The wordmark is split so "Sync" can carry the F1 red.
  expect(screen.getByText('Race')).toBeInTheDocument();
  expect(screen.getByText('Sync')).toBeInTheDocument();
});

// The top picker is wired to the same races Race Replay offers (replay-ready
// fixtures only), and picking one loads that session's real trace and driver
// field into the centre stage from the shared read-only endpoints.
test('the RaceSync picker lists the replay-ready races and loads the picked one into the stage', async () => {
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
  getRaceReplayState.mockImplementation(async (sessionId) => ({
    totalLaps: sessionId === 's-italy' ? 53 : 52,
    leaderboard: [
      { entryId: 'e1', driverName: 'Max VERSTAPPEN', teamName: 'Red Bull Racing' },
      { entryId: 'e2', driverName: 'Lewis HAMILTON', teamName: 'Mercedes' },
    ],
  }));

  render(<App />);

  // Only the replay-ready sessions are offered — Race Replay's own filter.
  const select = await screen.findByLabelText('Choose a race');
  expect(within(select).queryByRole('option', { name: /Spanish/ })).not.toBeInTheDocument();

  // Nothing is picked by default: the map carries the workspace instructions
  // and no replay data is fetched until a race is chosen.
  expect(screen.getByLabelText('How to use RaceSync')).toBeInTheDocument();
  expect(screen.getByText('Pick a race above to load its replay.')).toBeInTheDocument();
  expect(screen.getByText('Don’t just watch the race. Read it.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Circuit map and driver positions')).not.toBeInTheDocument();
  expect(getRaceReplayTrackShape).not.toHaveBeenCalled();
  expect(getRaceReplayState).not.toHaveBeenCalled();

  // Picking a race replaces the instructions with that session's real trace
  // and driver field.
  fireEvent.change(select, { target: { value: 's-italy' } });
  const stage = await screen.findByLabelText('Circuit map and driver positions');
  // The marker only appears once BOTH fetches have landed (the trace and the
  // leaderboard), so this waits for the whole stage.
  await within(stage).findByText('VER', { selector: '.racesync-stage-car' });
  expect(screen.queryByLabelText('How to use RaceSync')).not.toBeInTheDocument();
  expect(getRaceReplayState).toHaveBeenCalledWith('s-italy', { lap: 9999 });

  expect(within(stage).getByRole('heading', { name: 'Italian Grand Prix' })).toBeInTheDocument();
  expect(within(stage).getByText('Monza · Italy · 12 Sep 2021')).toBeInTheDocument();
  expect(within(stage).getByText('Lap 53/53')).toBeInTheDocument();
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

  // Picking another race re-loads the stage for that session.
  fireEvent.change(select, { target: { value: 's-britain' } });
  expect(await within(stage).findByText('Lap 52/52')).toBeInTheDocument();
  expect(within(stage).getByRole('heading', { name: 'British Grand Prix' })).toBeInTheDocument();
  expect(getRaceReplayState).toHaveBeenCalledWith('s-britain', { lap: 9999 });
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
