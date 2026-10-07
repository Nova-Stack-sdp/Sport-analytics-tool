import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProfilePage from '../pages/ProfilePage';
import { clearSession, getDrivers, getFixtures, getTeams } from '../api/client';
import {
  loadUserPreferences,
  readCachedUserPreferences,
  saveUserPreferences,
  subscribeToUserPreferences,
} from '../services/userPreferences';

const mockClearAuth = jest.fn();
const mockDeleteAccount = jest.fn();
const mockUser = {
  uid: 'user-123',
  displayName: 'Alex Morgan',
  email: 'alex@example.test',
  emailVerified: true,
  metadata: { creationTime: '2026-03-14T10:00:00Z' },
  providerData: [{ providerId: 'password' }],
};

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    isAdmin: false,
    deleteAccount: mockDeleteAccount,
    signOut: mockClearAuth,
  }),
}));
jest.mock('../context/DeveloperModeContext', () => ({
  useDeveloperMode: () => ({ isDeveloperMode: false, setDeveloperMode: jest.fn() }),
}));
jest.mock('../firebase', () => ({
  auth: {},
  db: {},
}));
jest.mock('firebase/auth', () => ({
  signOut: jest.fn().mockResolvedValue(),
}));
jest.mock('../api/client', () => ({
  clearSession: jest.fn().mockResolvedValue(),
  getDrivers: jest.fn().mockResolvedValue({
    drivers: [{ id: 'driver-1', name: 'Lando Norris' }],
  }),
  getTeams: jest.fn().mockResolvedValue({
    teams: [{ id: 'team-1', name: 'McLaren' }],
  }),
  getFixtures: jest.fn().mockResolvedValue({
    fixtures: [{
      id: 'race-1', meetingName: 'Spanish Grand Prix', season: 2026, type: 'Race',
    }],
  }),
}));
jest.mock('../services/userPreferences', () => ({
  readCachedUserPreferences: jest.fn(() => ({
    displayName: 'Alex Morgan',
    followedDriverIds: [],
    followedTeamIds: [],
    followedRaceIds: [],
    defaultNewsFilter: 'for-you',
  })),
  loadUserPreferences: jest.fn().mockResolvedValue({
    displayName: 'Alex Morgan',
    followedDriverIds: [],
    followedTeamIds: [],
    followedRaceIds: [],
    defaultNewsFilter: 'for-you',
    storage: 'cloud',
    syncError: '',
  }),
  saveUserPreferences: jest.fn().mockImplementation(async (_user, preferences) => ({
    ...preferences,
    storage: 'cloud',
  })),
  subscribeToUserPreferences: jest.fn(() => () => {}),
}));
jest.mock('../components/profile/NewsFeedPanel', () => () => <div>Live F1 news panel</div>);

describe('ProfilePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    const preferences = {
      displayName: 'Alex Morgan',
      followedDriverIds: [],
      followedTeamIds: [],
      followedRaceIds: [],
      defaultNewsFilter: 'for-you',
    };
    readCachedUserPreferences.mockReturnValue(preferences);
    loadUserPreferences.mockResolvedValue({
      ...preferences,
      storage: 'cloud',
      syncError: '',
    });
    saveUserPreferences.mockImplementation(async (_user, value) => ({
      ...value,
      storage: 'cloud',
    }));
    subscribeToUserPreferences.mockReturnValue(() => {});
    getDrivers.mockResolvedValue({ drivers: [{ id: 'driver-1', name: 'Lando Norris' }] });
    getTeams.mockResolvedValue({ teams: [{ id: 'team-1', name: 'McLaren' }] });
    getFixtures.mockResolvedValue({
      fixtures: [{
        id: 'race-1', meetingName: 'Spanish Grand Prix', season: 2026, type: 'Race',
      }],
    });
    mockDeleteAccount.mockResolvedValue();
  });
  afterEach(() => jest.clearAllMocks());

  test('shows the signed-in user account details', async () => {
    render(<MemoryRouter><ProfilePage /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Alex Morgan' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('alex@example.test')).toBeDisabled();
    expect(screen.getByText('14 March 2026')).toBeInTheDocument();
    expect(screen.getByText('Standard access')).toBeInTheDocument();
  });

  test('shows the profile dashboard tabs and opens the live news panel', async () => {
    render(<MemoryRouter><ProfilePage /></MemoryRouter>);

    expect(await screen.findByRole('tab', { name: 'User Profile' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'News Feed' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Calendar' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'News Feed' }));

    expect(screen.getByRole('tab', { name: 'News Feed' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Live F1 news panel')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Alex Morgan' })).not.toBeInTheDocument();
  });

  test('opens straight on the Settings tab from /profile?tab=settings', () => {
    render(<MemoryRouter initialEntries={['/profile?tab=settings']}><ProfilePage /></MemoryRouter>);

    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('checkbox', { name: /toggle developer mode/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Alex Morgan' })).not.toBeInTheDocument();
  });

  test('falls back to the User Profile tab for an unknown tab value', () => {
    render(<MemoryRouter initialEntries={['/profile?tab=nope']}><ProfilePage /></MemoryRouter>);

    expect(screen.getByRole('tab', { name: 'User Profile' })).toHaveAttribute('aria-selected', 'true');
  });

  test('the Account settings button switches to the Settings tab', () => {
    render(<MemoryRouter><ProfilePage /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Account settings' }));

    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('checkbox', { name: /toggle developer mode/i })).toBeInTheDocument();
  });

  test('saves the display name locally and syncs account preferences', async () => {
    render(<MemoryRouter><ProfilePage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Alex Driver' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(JSON.parse(
      window.localStorage.getItem('f1-analytics-profile:user-123')
    )).toEqual(expect.objectContaining({ displayName: 'Alex Driver' })));
    expect(saveUserPreferences).toHaveBeenCalledWith(
      mockUser,
      expect.objectContaining({ displayName: 'Alex Driver', defaultNewsFilter: 'for-you' })
    );
    expect(await screen.findByRole('status')).toHaveTextContent('saved to your account');
  });

  test('asks for confirmation before deleting and can be cancelled', () => {
    render(<MemoryRouter><ProfilePage /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Delete profile' }));

    // The irreversible action sits behind an inline confirmation.
    expect(screen.getByRole('group', { name: 'Confirm account deletion' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep my account' }));

    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete profile' })).toBeInTheDocument();
  });

  test('deletes the account after confirmation and returns to the home page', async () => {
    let resolveDelete;
    mockDeleteAccount.mockImplementationOnce(
      () => new Promise((resolve) => { resolveDelete = resolve; })
    );

    render(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/" element={<div>Home page</div>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete my account' }));

    // While the request is in flight the button is disabled and says so.
    expect(await screen.findByRole('button', { name: 'Deleting…' })).toBeDisabled();

    resolveDelete();

    expect(await screen.findByText('Home page')).toBeInTheDocument();
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
  });

  test('keeps the account and shows the error when the backend refuses', async () => {
    mockDeleteAccount.mockRejectedValueOnce(
      Object.assign(new Error('Request failed'), {
        body: { error: 'Could not delete your account. Please try again.' },
      })
    );

    render(<MemoryRouter><ProfilePage /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Delete profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete my account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete your account');
    // Back to the start, so the user can retry.
    expect(screen.getByRole('button', { name: 'Delete profile' })).toBeInTheDocument();
  });

  test('signs out and redirects home even when the backend session cannot be cleared', async () => {
    // Reproduces the "Uncaught runtime errors: Failed to fetch" overlay:
    // with the API unreachable, clearSession() rejects. A rejected
    // Promise.all used to skip the redirect and leave an unhandled
    // rejection behind.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    clearSession.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/" element={<div>Home page</div>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText('Home page')).toBeInTheDocument();
    expect(mockClearAuth).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'Sign-out: could not clear the backend session cookie.',
      expect.any(TypeError)
    );
    warn.mockRestore();
  });

});
