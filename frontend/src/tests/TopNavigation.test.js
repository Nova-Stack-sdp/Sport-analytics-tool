import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import TopNav from '../components/TopNavigation';
import { signOut } from 'firebase/auth';

let mockUser = null;

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));
jest.mock('../firebase', () => ({ auth: {} }));
jest.mock('firebase/auth', () => ({ signOut: jest.fn() }));

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
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockUser = null;
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

  test('shows protected links, display-name initials, and signs a user out', async () => {
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
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/sign-in'));
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
