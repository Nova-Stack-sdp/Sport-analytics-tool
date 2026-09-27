import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProfilePage from '../pages/ProfilePage';
import { getDrivers, getFixtures, getTeams } from '../api/client';
import {
  loadUserPreferences,
  readCachedUserPreferences,
  saveUserPreferences,
} from '../services/userPreferences';

const mockClearAuth = jest.fn();
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
    signOut: mockClearAuth,
  }),
}));
jest.mock('../context/DeveloperModeContext', () => ({
  useDeveloperMode: () => ({ isDeveloperMode: false }),
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
    getDrivers.mockResolvedValue({ drivers: [{ id: 'driver-1', name: 'Lando Norris' }] });
    getTeams.mockResolvedValue({ teams: [{ id: 'team-1', name: 'McLaren' }] });
    getFixtures.mockResolvedValue({
      fixtures: [{
        id: 'race-1', meetingName: 'Spanish Grand Prix', season: 2026, type: 'Race',
      }],
    });
  });
  afterEach(() => jest.clearAllMocks());

  test('shows the signed-in user account details', async () => {
    render(<MemoryRouter><ProfilePage /></MemoryRouter>);

    expect(await screen.findByText('Firestore synced')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Alex Morgan' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('alex@example.test')).toBeDisabled();
    expect(screen.getByText('14 March 2026')).toBeInTheDocument();
    expect(screen.getByText('Standard access')).toBeInTheDocument();
  });

  test('shows the profile dashboard tabs and opens the live news panel', async () => {
    render(<MemoryRouter><ProfilePage /></MemoryRouter>);

    expect(await screen.findByText('Firestore synced')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'User Profile' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'News Feed' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Calendar' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'News Feed' }));

    expect(screen.getByRole('tab', { name: 'News Feed' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Live F1 news panel')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Alex Morgan' })).not.toBeInTheDocument();
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

  test('adds a followed driver and saves the selection', async () => {
    render(<MemoryRouter><ProfilePage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('option', { name: 'Lando Norris' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Add drivers'), { target: { value: 'driver-lando-norris' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save news preferences' }));

    await waitFor(() => expect(saveUserPreferences).toHaveBeenLastCalledWith(
      mockUser,
      expect.objectContaining({ followedDriverIds: ['driver-lando-norris'] })
    ));
  });

  test('uses the official driver and team lists when the live catalogues are empty', async () => {
    getDrivers.mockResolvedValue({ drivers: [] });
    getTeams.mockResolvedValue({ teams: [] });

    render(<MemoryRouter><ProfilePage /></MemoryRouter>);

    expect(await screen.findByRole('option', { name: 'Max Verstappen' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cadillac' })).toBeInTheDocument();
    expect(screen.getByText(/using the official 2026 driver and team lists/i)).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'General' })).not.toBeInTheDocument();
  });
});
