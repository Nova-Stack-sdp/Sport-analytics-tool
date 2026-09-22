import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RequireAuth from '../components/RequireAuth';

let mockAuthState = { user: null, loading: false };
let mockIsDeveloperMode = false;

jest.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));
jest.mock('../context/DeveloperModeContext', () => ({
  useDeveloperMode: () => ({ isDeveloperMode: mockIsDeveloperMode, setDeveloperMode: jest.fn() }),
}));

function renderGuarded({ role, path = '/protected' } = {}) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/protected"
          element={
            <RequireAuth role={role}>
              <div>Protected content</div>
            </RequireAuth>
          }
        />
        <Route path="/sign-in" element={<div>Sign in page</div>} />
        <Route path="/developer" element={<div>Developer explainer</div>} />
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
    mockAuthState = { user: { uid: 'u1' }, loading: false };
    renderGuarded();

    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  test('sends a signed-in user without developer mode to /developer instead of /sign-in', () => {
    mockAuthState = { user: { uid: 'u1' }, loading: false };
    mockIsDeveloperMode = false;
    renderGuarded({ role: 'developer' });

    expect(screen.getByText('Developer explainer')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  test('lets a signed-in user with developer mode on through a developer-gated route', () => {
    mockAuthState = { user: { uid: 'u1' }, loading: false };
    mockIsDeveloperMode = true;
    renderGuarded({ role: 'developer' });

    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });
});