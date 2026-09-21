import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DeveloperPage from '../pages/DeveloperPage';

let mockIsDeveloperMode = false;

jest.mock('../context/DeveloperModeContext', () => ({
  useDeveloperMode: () => ({ isDeveloperMode: mockIsDeveloperMode, setDeveloperMode: jest.fn() }),
}));

function renderDeveloperPage() {
  render(
    <MemoryRouter>
      <DeveloperPage />
    </MemoryRouter>
  );
}

describe('DeveloperPage', () => {
  afterEach(() => {
    mockIsDeveloperMode = false;
  });

  test('shows the explainer with instructions to enable developer mode when it is off', () => {
    renderDeveloperPage();

    expect(screen.getByText(/how to turn on developer mode/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to settings/i })).toHaveAttribute('href', '/settings');
    expect(screen.queryByText('API endpoints')).not.toBeInTheDocument();
  });

  test('shows the full developer console once developer mode is on', () => {
    mockIsDeveloperMode = true;
    renderDeveloperPage();

    expect(screen.getByText('API endpoints')).toBeInTheDocument();
    expect(screen.queryByText(/how to turn on developer mode/i)).not.toBeInTheDocument();
  });
});