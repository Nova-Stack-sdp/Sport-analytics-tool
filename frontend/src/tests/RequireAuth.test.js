import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RequireAuth from '../components/RequireAuth';

let mockAuthState = { user: null, loading: false };
let mockIsDeveloperMode = false;

// A signed-in user is verified unless a test says otherwise: the email gate
// below the role checks is what most of this file is about.
function signedIn(overrides = {}) {
  return { user: { uid: 'u1' }, loading: false, emailVerified: true, ...overrides };
}

jest.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));
jest.mock('../context/DeveloperModeContext', () => ({
  useDeveloperMode: () => ({ isDeveloperMode: mockIsDeveloperMode, setDeveloperMode: jest.fn() }),
}));

function renderGuarded({ role, path = '/protected', allowUnverified = false } = {}) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/protected"
          element={
            <RequireAuth role={role} allowUnverified={allowUnverified}>
              <div>Protected content</div>
            </RequireAuth>
          }
        />
        <Route path="/sign-in" element={<div>Sign in page</div>} />
        <Route path="/developer" element={<div>Developer explainer</div>} />
        <Route path="/overview" element={<div>Overview page</div>} />
        <Route path="/verify-email" element={<div>Verify email page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RequireAuth', () => {
  afterEach(() => {
    mockAuthState = { user: null, loading: false };
    mockIsDeveloperMode = false;
  });

  test('redirects a signed-out user to sign-in', () => {
    renderGuarded();

    expect(screen.getByText('Sign in page')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  test('shows a loading state instead of redirecting while auth is still restoring', () => {
    mockAuthState = { user: null, loading: true };
    renderGuarded();

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('Sign in page')).not.toBeInTheDocument();
  });

  test('lets a signed-in user through when no role is required', () => {
    mockAuthState = signedIn();
    renderGuarded();

    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  test('sends a signed-in user without developer mode to /developer instead of /sign-in', () => {
    mockAuthState = signedIn();
    mockIsDeveloperMode = false;
    renderGuarded({ role: 'developer' });

    expect(screen.getByText('Developer explainer')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  test('lets a signed-in user with developer mode on through a developer-gated route', () => {
    mockAuthState = signedIn();
    mockIsDeveloperMode = true;
    renderGuarded({ role: 'developer' });

    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  test('sends a signed-in non-admin away from an admin-gated route to /overview', () => {
    mockAuthState = signedIn({ isAdmin: false });
    mockIsDeveloperMode = true; // developer mode is not admin
    renderGuarded({ role: 'admin' });

    expect(screen.getByText('Overview page')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  test('lets an admin through an admin-gated route', () => {
    mockAuthState = signedIn({ user: { uid: 'boss' }, isAdmin: true });
    renderGuarded({ role: 'admin' });

    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  test('still sends a signed-out user to sign-in for an admin-gated route', () => {
    renderGuarded({ role: 'admin' });

    expect(screen.getByText('Sign in page')).toBeInTheDocument();
  });

  test('sends a signed-in but unverified user to the verify page, not to sign-in', () => {
    mockAuthState = signedIn({ emailVerified: false });
    renderGuarded();

    expect(screen.getByText('Verify email page')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(screen.queryByText('Sign in page')).not.toBeInTheDocument();
  });

  test('checks the address before the role, so a developer without one still lands on verify', () => {
    mockAuthState = signedIn({ emailVerified: false });
    mockIsDeveloperMode = true;
    renderGuarded({ role: 'developer' });

    expect(screen.getByText('Verify email page')).toBeInTheDocument();
  });

  test('exempts an unverified admin, matching the backend allowlist', () => {
    mockAuthState = signedIn({ user: { uid: 'boss' }, emailVerified: false, isAdmin: true });
    renderGuarded({ role: 'admin' });

    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  test('lets an unverified user through only where allowUnverified says so', () => {
    mockAuthState = signedIn({ emailVerified: false });
    renderGuarded({ allowUnverified: true });

    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });
});
