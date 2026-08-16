import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

test('renders the Overview page by default', () => {
  render(<App />);
  expect(screen.getByText(/Analytics/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Overview/i).length).toBeGreaterThan(0);
});

test('nav switches to the Developer page', () => {
  render(<App />);
  fireEvent.click(screen.getByText('Developer'));
  expect(screen.getByText(/API endpoints/i)).toBeInTheDocument();
});