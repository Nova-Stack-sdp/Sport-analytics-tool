import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProfilePage from '../pages/ProfilePage';

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
  useDeveloperMode: () => ({ isDeveloperMode: false, setDeveloperMode: jest.fn() }),
}));
jest.mock('../firebase', () => ({
  auth: {},
}));
jest.mock('firebase/auth', () => ({
  signOut: jest.fn().mockResolvedValue(),
}));
jest.mock('../api/client', () => ({ clearSession: jest.fn().mockResolvedValue() }));

describe('ProfilePage', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => jest.clearAllMocks());

  test('shows the signed-in user account details', () => {
    render(<MemoryRouter><ProfilePage /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'Alex Morgan' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('alex@example.test')).toBeDisabled();
    expect(screen.getByText('14 March 2026')).toBeInTheDocument();
    expect(screen.getByText('Standard access')).toBeInTheDocument();
  });

  test('shows User Profile, Settings, News Feed, and Calendar tabs with empty future sections', () => {
    render(<MemoryRouter><ProfilePage /></MemoryRouter>);

    expect(screen.getByRole('tab', { name: 'User Profile' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'News Feed' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Calendar' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'News Feed' }));

    expect(screen.getByRole('tab', { name: 'News Feed' })).toHaveAttribute('aria-selected', 'true');
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

  test('saves the display name in browser storage', async () => {
    render(<MemoryRouter><ProfilePage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Alex Driver' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(JSON.parse(
      window.localStorage.getItem('f1-analytics-profile:user-123')
    )).toEqual(expect.objectContaining({ displayName: 'Alex Driver' })));
    expect(await screen.findByRole('status')).toHaveTextContent('saved in this browser');
  });
});
