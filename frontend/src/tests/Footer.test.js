import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Footer from '../components/Footer';

let mockAuth = { user: null, isDeveloperMode: false };
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }));

const renderFooter = () => render(<MemoryRouter><Footer /></MemoryRouter>);
const href = (name) => screen.getByRole('link', { name }).getAttribute('href');

describe('Footer', () => {
  test('links every public page', () => {
    mockAuth = { user: null, isDeveloperMode: false };
    renderFooter();
    expect(href('Race Replay')).toBe('/replay');
    expect(href('Drivers')).toBe('/drivers');
    expect(href('Teams')).toBe('/teams');
    expect(href('Telemetry TV')).toBe('/telemetry-tv');
  });

  test('signed out: sign-in links, and no claim that the site is live', () => {
    mockAuth = { user: null, isDeveloperMode: false };
    renderFooter();
    expect(href('Sign in')).toBe('/sign-in');
    expect(href('Create account')).toBe('/sign-up');
    expect(href('Sign in to submit data')).toBe('/sign-in');
    expect(screen.queryByText(/live/i)).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(`© ${new Date().getFullYear()} F1Lytics`))).toBeInTheDocument();
  });

  test('signed in without developer mode: account links and how to turn developer mode on', () => {
    mockAuth = { user: { uid: 'u1' }, isDeveloperMode: false };
    renderFooter();
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(href('Profile')).toBe('/profile');
    expect(href('Notifications')).toBe('/profile?tab=notifications');
    expect(href('Turn on developer mode')).toBe('/profile?tab=settings');
    expect(screen.queryByRole('link', { name: 'API docs' })).not.toBeInTheDocument();
  });

  test('developer mode: the workspace and the real API docs route', () => {
    mockAuth = { user: { uid: 'u1' }, isDeveloperMode: true };
    renderFooter();
    expect(href('Developer workspace')).toBe('/developer');
    expect(href('API docs')).toBe('/developer/api-docs');
  });
});
