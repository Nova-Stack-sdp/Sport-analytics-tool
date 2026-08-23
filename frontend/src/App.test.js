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

beforeEach(() => {
  window.history.pushState({}, '', '/');
});

test('renders the welcome page by default, with no persistent top nav', () => {
  render(<App />);
  expect(screen.getByText('NOVA STACK')).toBeInTheDocument();
  expect(screen.queryByLabelText('Main navigation')).not.toBeInTheDocument();
});

test('signed-out users can view Overview without signing in', async () => {
  render(<App />);
  emitAuthState(null);

  fireEvent.click(screen.getByRole('link', { name: 'Overview' }));

  await waitFor(() => expect(screen.getAllByText(/Overview/i).length).toBeGreaterThan(0));
  expect(screen.queryByRole('heading', { name: /^sign in$/i })).not.toBeInTheDocument();
});

test('signed-out users are redirected to sign-in when visiting Submissions', async () => {
  render(<App />);
  emitAuthState(null);

  fireEvent.click(screen.getByRole('link', { name: 'Submissions' }));

  await waitFor(() =>
    expect(screen.getByRole('heading', { name: /^sign in$/i })).toBeInTheDocument()
  );
});

test('signed-in users reach the Overview dashboard, with the persistent top nav', async () => {
  render(<App />);
  emitAuthState({ uid: 'u1', email: 'driver@example.com' });

  fireEvent.click(screen.getByRole('link', { name: 'Overview' }));

  await waitFor(() => expect(screen.getAllByText(/Overview/i).length).toBeGreaterThan(0));
  expect(screen.getByLabelText('Main navigation')).toBeInTheDocument();
});

test('nav switches to the Developer page once signed in', async () => {
  render(<App />);
  emitAuthState({ uid: 'u1' });

  fireEvent.click(screen.getByRole('link', { name: 'Overview' }));
  await waitFor(() => expect(screen.getAllByText(/Overview/i).length).toBeGreaterThan(0));

  fireEvent.click(screen.getByText('Developer'));
  expect(screen.getByText(/API endpoints/i)).toBeInTheDocument();
});

test('the hero banner\'s live fixture link works once signed in', async () => {
  render(<App />);
  emitAuthState({ uid: 'u1' });

  expect(screen.getByText('NOVA STACK')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Open live fixture'));

  await waitFor(() => expect(screen.getByText('Event log')).toBeInTheDocument());
});