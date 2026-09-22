import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { auth } from './firebase';
import { setDeveloperModeOnServer } from './api/client';

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

function getTopNavLink(name) {
  // The persistent top nav is the only region with aria-label="Main navigation".
  const topnav = screen.getByLabelText('Main navigation');
  const links = Array.from(topnav.querySelectorAll('a'));
  return links.find((a) => a.textContent.trim() === name);
}

beforeEach(() => {
  window.history.pushState({}, '', '/');
  auth.currentUser = null;
  setDeveloperModeOnServer.mockReset();
});

test('renders the welcome page by default, with the persistent top nav', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'F1 lytics' })).toBeInTheDocument();
  expect(screen.getByLabelText('Main navigation')).toBeInTheDocument();
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

test('signed-in users see the logged-in nav links, but Submissions and Datasets stay hidden until developer mode is on', async () => {
  render(<App />);
  emitAuthState(fakeFirebaseUser());

  fireEvent.click(getTopNavLink('Overview'));
  await waitFor(() => expect(screen.getAllByText(/Overview/i).length).toBeGreaterThan(0));

  expect(screen.getByRole('link', { name: 'Developer' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Submissions' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Datasets' })).not.toBeInTheDocument();
});

test('turning on developer mode from Settings reveals Submissions and Datasets in the nav', async () => {
  const devFlag = { value: false };
  setDeveloperModeOnServer.mockImplementation(async (enabled) => {
    devFlag.value = enabled;
    return { developer: enabled };
  });

  render(<App />);
  emitAuthState(fakeFirebaseUser({}, devFlag));

  fireEvent.click(getTopNavLink('Overview'));
  await waitFor(() => expect(screen.getAllByText(/Overview/i).length).toBeGreaterThan(0));

  fireEvent.click(getTopNavLink('Settings'));
  await waitFor(() => expect(screen.getByText('Developer mode')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('checkbox', { name: /toggle developer mode/i }));

  await waitFor(() => expect(screen.getByRole('link', { name: 'Submissions' })).toBeInTheDocument());
  expect(screen.getByRole('link', { name: 'Datasets' })).toBeInTheDocument();
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

  fireEvent.click(getTopNavLink('Settings'));
  await waitFor(() => expect(screen.getByText('Developer mode')).toBeInTheDocument());
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