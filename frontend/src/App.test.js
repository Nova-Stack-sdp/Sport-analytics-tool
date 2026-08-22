import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  window.history.pushState({}, '', '/');
});

test('renders the welcome page by default, with no persistent top nav', () => {
  render(<App />);
  expect(screen.getByText('NOVA STACK')).toBeInTheDocument();
  expect(screen.queryByLabelText('Main navigation')).not.toBeInTheDocument();
});

test('welcome page bottom nav reaches the Overview dashboard', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('link', { name: 'Overview' }));
  expect(screen.getAllByText(/Overview/i).length).toBeGreaterThan(0);
  expect(screen.getByLabelText('Main navigation')).toBeInTheDocument();
});

test('nav switches to the Developer page', () => {
  render(<App />);
  fireEvent.click(screen.getByText('Developer'));
  expect(screen.getByText(/API endpoints/i)).toBeInTheDocument();
});

test('sign-in is reachable once past the welcome page', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('link', { name: 'Overview' }));
  fireEvent.click(screen.getByTitle('Sign in'));
  expect(screen.getByRole('heading', { name: /Sign In or Sign Up/i })).toBeInTheDocument();
});

test('hero banner links to the live fixture', () => {
  render(<App />);
  expect(screen.getByText('NOVA STACK')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Open live fixture'));
  expect(screen.getByText('Event log')).toBeInTheDocument();
});