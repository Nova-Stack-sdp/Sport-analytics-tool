import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { getSession } from '../api/client';

let authCallback;
jest.mock('../firebase', () => ({ auth: { currentUser: null } }));
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (auth, callback) => {
    authCallback = callback;
    return () => {};
  },
}));
jest.mock('../api/client', () => ({
  getSession: jest.fn(),
}));

// A minimal stand-in for a real Firebase User — just enough surface
// (getIdTokenResult) for AuthContext to read the developer claim off it.
function fakeFirebaseUser({ uid = 'u1', email = 'a@b.com', developer = false } = {}) {
  return {
    uid,
    email,
    getIdTokenResult: jest.fn().mockResolvedValue({ claims: { developer } }),
  };
}

function Probe() {
  const { user, loading, isDeveloperMode } = useAuth();
  if (loading) return <div>loading</div>;
  return (
    <div>
      <div data-testid="uid">{user ? user.uid : 'none'}</div>
      <div data-testid="dev">{String(isDeveloperMode)}</div>
    </div>
  );
}

function renderProbe() {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
}

beforeEach(() => {
  require('../firebase').auth.currentUser = null;
  jest.clearAllMocks();
});

describe('AuthContext', () => {
  test('reads isDeveloperMode false from a fresh sign-in with no claim', async () => {
    renderProbe();
    await act(async () => {
      authCallback(fakeFirebaseUser({ developer: false }));
    });

    expect(screen.getByTestId('uid')).toHaveTextContent('u1');
    expect(screen.getByTestId('dev')).toHaveTextContent('false');
  });

  test('reads isDeveloperMode true when the token carries the developer claim', async () => {
    renderProbe();
    await act(async () => {
      authCallback(fakeFirebaseUser({ developer: true }));
    });

    expect(screen.getByTestId('dev')).toHaveTextContent('true');
  });

  test('falls back to the backend session when Firebase reports no user, and picks up its developer flag', async () => {
    getSession.mockResolvedValue({ uid: 'cookie-user', email: 'c@d.com', developer: true });
    renderProbe();

    await act(async () => {
      authCallback(null);
    });

    expect(screen.getByTestId('uid')).toHaveTextContent('cookie-user');
    expect(screen.getByTestId('dev')).toHaveTextContent('true');
  });

  test('is signed out (and not a developer) when neither Firebase nor the cookie has a session', async () => {
    getSession.mockRejectedValue(new Error('no session'));
    renderProbe();

    await act(async () => {
      authCallback(null);
    });

    expect(screen.getByTestId('uid')).toHaveTextContent('none');
    expect(screen.getByTestId('dev')).toHaveTextContent('false');
  });

  test('refreshDeveloperMode force-refreshes the token and updates the flag', async () => {
    const user = fakeFirebaseUser({ developer: false });
    require('../firebase').auth.currentUser = user;

    let refresh;
    function ProbeWithRefresh() {
      const auth = useAuth();
      refresh = auth.refreshDeveloperMode;
      return <Probe />;
    }
    render(
      <AuthProvider>
        <ProbeWithRefresh />
      </AuthProvider>
    );
    await act(async () => {
      authCallback(user);
    });
    expect(screen.getByTestId('dev')).toHaveTextContent('false');

    // Simulate the backend having just set the claim — the next token
    // fetch (forced) now returns it.
    user.getIdTokenResult.mockResolvedValue({ claims: { developer: true } });
    await act(async () => {
      await refresh();
    });

    expect(screen.getByTestId('dev')).toHaveTextContent('true');
    expect(user.getIdTokenResult).toHaveBeenLastCalledWith(true);
  });
});