import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ApiDocsPage from '../pages/ApiDocsPage';

test('documents the public v1 API endpoints, including exports and the traceability endpoint', () => {
  render(<MemoryRouter><ApiDocsPage /></MemoryRouter>);

  expect(screen.getByText('Public API — v1')).toBeInTheDocument();
  expect(screen.getByText('/api/v1/events')).toBeInTheDocument();
  expect(screen.getByText('/api/v1/fixtures/:id/statistics/:driverId')).toBeInTheDocument();
  expect(screen.getByText('/api/v1/exports/events?format=csv|json')).toBeInTheDocument();
});
