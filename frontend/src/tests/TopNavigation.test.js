import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import TopNav from '../components/TopNavigation';
import { signOut } from 'firebase/auth';
import { clearSession } from '../api/client';

let mockUser = null;
let mockIsDeveloperMode = false;

jest.mock('../context/AuthContext', () => ({
  // signOut is destructured by TopNavigation's handleSignOut (as clearAuth) —
  // omitting it here makes that call throw a TypeError and silently skip the
  // real firebase signOut() call it's supposed to trigger.
  useAuth: () => ({ user: mockUser, signOut: jest.fn() }),
}));
jest.mock('../context/DeveloperModeContext', () => ({
  useDeveloperMode: () => ({ isDeveloperMode: mockIsDeveloperMode, setDeveloperMode: jest.fn() }),
}));
jest.mock('../firebase', () => ({ auth: {} }));
jest.mock('firebase/auth', () => ({ signOut: jest.fn() }));
// The real client goes over the network via fetch — mock it so these tests
// exercise the component's sign-out behavior rather than a live backend.
jest.mock('../api/client', () => ({ clearSession: jest.fn() }));

function LocationDisplay() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderNav({ user = null, path = '/teams', theme = 'dark' } = {}) {
  mockUser = user;
  const onToggleTheme = jest.fn();
  render(
    <MemoryRouter initialEntries={[path]}>
      <TopNav theme={theme} onToggleTheme={onToggleTheme} />
      <LocationDisplay />
    </MemoryRouter>
  );
  return onToggleTheme;
}

describe('TopNavigation', () => {
  beforeEach(() => {
    signOut.mockResolvedValue();
    clearSession.mockResolvedValue({ status: 'ok' });
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockUser = null;
    mockIsDeveloperMode = false;
  });

  test('renders public Teams and Drivers links, highlights the active route, and lets guests toggle the theme', () => {
    const onToggleTheme = renderNav();

    expect(screen.getByRole('link', { name: 'Teams' })).toHaveAttribute('href', '/teams');
    expect(screen.getByRole('link', { name: 'Teams' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Drivers' })).toHaveAttribute('href', '/drivers');
    expect(screen.queryByRole('link', { name: 'Submissions' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'SignIn' })).toHaveAttribute('href', '/sign-in');
    expect(screen.getByText('☀')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Toggle dark mode'));

    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  test('shows logged-in links but hides developer-only links until developer mode is on', () => {
    renderNav({
      user: { displayName: 'Max Verstappen', email: 'max@example.test' },
      path: '/overview',
      theme: 'light',
    });

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Developer' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Submissions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Datasets' })).not.toBeInTheDocument();
  });

  test('shows Datasets and Submissions once developer mode is on, display-name initials, and signs a user out', async () => {
    mockIsDeveloperMode = true;
    renderNav({
      user: { displayName: 'Max Verstappen', email: 'max@example.test' },
      path: '/overview',
      theme: 'light',
    });

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Submissions' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Datasets' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Developer' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'M' })).toHaveAttribute(
      'title',
      'Signed in as max@example.test · Sign out'
    );
    expect(screen.getByText('☾')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'M' }));

    await waitFor(() => expect(signOut).toHaveBeenCalledWith({}));
    expect(clearSession).toHaveBeenCalled();
    // handleSignOut navigates to '/' (the welcome page), not '/sign-in'.
    // Anchored: toHaveTextContent does a substring match for a string
    // argument, so a plain '/' would also be satisfied by the '/overview'
    // path we started from and the assertion would never fail.
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
  });

  test('still signs out and redirects when the backend session cookie cannot be cleared', async () => {
    // Reproduces the "Uncaught runtime errors: Failed to fetch" overlay: with
    // the API unreachable, clearSession() rejects. A rejected Promise.all used
    // to skip the redirect entirely and leave an unhandled rejection behind.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    clearSession.mockRejectedValue(new TypeError('Failed to fetch'));
    renderNav({
      user: { displayName: 'Max Verstappen', email: 'max@example.test' },
      path: '/overview',
    });

    fireEvent.click(screen.getByRole('button', { name: 'M' }));

    await waitFor(() => expect(signOut).toHaveBeenCalledWith({}));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  test('uses an email initial when display name is absent', () => {
    renderNav({ user: { displayName: '', email: 'lando@example.test' } });

    expect(screen.getByRole('button', { name: 'L' })).toHaveAttribute(
      'title',
      'Signed in as lando@example.test · Sign out'
    );
  });

  test('uses a safe fallback initial and title when user identity fields are null', () => {
    renderNav({ user: { displayName: null, email: null } });

    expect(screen.getByRole('button', { name: '?' })).toHaveAttribute(
      'title',
      'Signed in as you · Sign out'
    );
  });
});