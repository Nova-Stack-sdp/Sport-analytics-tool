import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DeveloperPage from '../pages/DeveloperPage';

let mockIsDeveloperMode = false;

jest.mock('../context/DeveloperModeContext', () => ({
  useDeveloperMode: () => ({ isDeveloperMode: mockIsDeveloperMode, setDeveloperMode: jest.fn() }),
}));

function renderDeveloperPage(path = '/developer') {
  render(
    <MemoryRouter initialEntries={[path]}>
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
    expect(screen.getByRole('link', { name: /go to settings/i })).toHaveAttribute('href', '/profile?tab=settings');
    expect(screen.queryByText('API endpoints')).not.toBeInTheDocument();
  });

  test('shows the full developer console once developer mode is on', () => {
    mockIsDeveloperMode = true;
    renderDeveloperPage();

    expect(screen.getByText('API endpoints')).toBeInTheDocument();
    expect(screen.queryByText(/how to turn on developer mode/i)).not.toBeInTheDocument();
  });

  test('keeps the Datasets and Submissions tabs hidden until developer mode is on', () => {
    renderDeveloperPage('/developer?tab=datasets');

    expect(screen.queryByRole('tab', { name: 'Datasets' })).not.toBeInTheDocument();
    expect(screen.queryByText('Build a custom export')).not.toBeInTheDocument();
  });

  test('shows API Console, Datasets and Submissions tabs in developer mode, opening on the console', () => {
    mockIsDeveloperMode = true;
    renderDeveloperPage();

    expect(screen.getByRole('tab', { name: 'API Console' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Datasets' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Submissions' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Datasets' }));
    expect(screen.getByText('Build a custom export')).toBeInTheDocument();
    expect(screen.queryByText('API endpoints')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Submissions' }));
    expect(screen.getByText('Review & approval queue')).toBeInTheDocument();
  });

  test.each([
    ['/developer?tab=datasets', 'Datasets', 'Build a custom export'],
    ['/developer?tab=submissions', 'Submissions', 'Review & approval queue'],
  ])('opens straight on the right tab from %s', (path, tabName, content) => {
    mockIsDeveloperMode = true;
    renderDeveloperPage(path);

    expect(screen.getByRole('tab', { name: tabName })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(content)).toBeInTheDocument();
  });
});
