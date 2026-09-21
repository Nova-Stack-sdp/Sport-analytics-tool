import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';

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
  onAuthStateChanged: (auth, callback) => {
    authCallback = callback;
    return () => {};
  },
  signOut: jest.fn(),
}));

function emitAuthState(user) {
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
  // Developer mode is persisted per-uid in real localStorage (see
  // DeveloperModeContext) — clear it so one test toggling it on doesn't
  // leak into the next test reusing the same mock uid.
  localStorage.clear();
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
  emitAuthState({ uid: 'u1' });

  fireEvent.click(getTopNavLink('Overview'));
  await waitFor(() => expect(screen.getAllByText(/Overview/i).length).toBeGreaterThan(0));

  expect(screen.getByRole('link', { name: 'Developer' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Submissions' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Datasets' })).not.toBeInTheDocument();
});

test('turning on developer mode from Settings reveals Submissions and Datasets in the nav', async () => {
  render(<App />);
  emitAuthState({ uid: 'u1' });

  fireEvent.click(getTopNavLink('Overview'));
  await waitFor(() => expect(screen.getAllByText(/Overview/i).length).toBeGreaterThan(0));

  fireEvent.click(getTopNavLink('Settings'));
  await waitFor(() => expect(screen.getByText('Developer mode')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('checkbox', { name: /toggle developer mode/i }));

  expect(screen.getByRole('link', { name: 'Submissions' })).toBeInTheDocument();
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
  emitAuthState({ uid: 'u1', email: 'driver@example.com' });

  fireEvent.click(getTopNavLink('Overview'));

  await waitFor(() => expect(screen.getAllByText(/Overview/i).length).toBeGreaterThan(0));
  expect(screen.getByLabelText('Main navigation')).toBeInTheDocument();
});

test('nav switches to the Developer explainer once signed in, before developer mode is on', async () => {
  render(<App />);
  emitAuthState({ uid: 'u1' });

  fireEvent.click(getTopNavLink('Overview'));
  await waitFor(() => expect(screen.getAllByText(/Overview/i).length).toBeGreaterThan(0));

  fireEvent.click(screen.getByText('Developer'));
  expect(screen.getByText(/how to turn on developer mode/i)).toBeInTheDocument();
});

test('nav shows the full Developer console once developer mode is turned on', async () => {
  render(<App />);
  emitAuthState({ uid: 'u1' });

  fireEvent.click(getTopNavLink('Overview'));
  await waitFor(() => expect(screen.getAllByText(/Overview/i).length).toBeGreaterThan(0));

  fireEvent.click(getTopNavLink('Settings'));
  await waitFor(() => expect(screen.getByText('Developer mode')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('checkbox', { name: /toggle developer mode/i }));

  fireEvent.click(screen.getByText('Developer'));
  expect(screen.getByText(/API endpoints/i)).toBeInTheDocument();
});

test('the hero banner\'s live fixture link works once signed in', async () => {
  render(<App />);
  emitAuthState({ uid: 'u1' });

  expect(screen.getByRole('heading', { name: 'F1 lytics' })).toBeInTheDocument();
  fireEvent.click(screen.getByText('Open live fixture'));

  await waitFor(() => expect(screen.getByText('Event log')).toBeInTheDocument());
});