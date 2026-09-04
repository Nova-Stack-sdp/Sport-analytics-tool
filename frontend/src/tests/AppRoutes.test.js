import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from '../navigation/AppRoutes';

jest.mock('../pages/WelcomePage', () => ({ __esModule: true, default: () => <div>Welcome route</div> }));
jest.mock('../pages/OverviewPage', () => ({ __esModule: true, default: () => <div>Overview route</div> }));
jest.mock('../pages/FixturesEventsPage', () => ({ __esModule: true, default: () => <div>Fixtures route</div> }));
jest.mock('../pages/StatisticsPage', () => ({ __esModule: true, default: () => <div>Statistics route</div> }));
jest.mock('../pages/SubmissionsPage', () => ({ __esModule: true, default: () => <div>Submissions route</div> }));
jest.mock('../pages/TimeTravelPage', () => ({ __esModule: true, default: () => <div>Time travel route</div> }));
jest.mock('../pages/DatasetsPage', () => ({ __esModule: true, default: () => <div>Datasets route</div> }));
jest.mock('../pages/DeveloperPage', () => ({ __esModule: true, default: () => <div>Developer route</div> }));
jest.mock('../pages/AdminPage', () => ({ __esModule: true, default: () => <div>Admin route</div> }));
jest.mock('../pages/SignInPage', () => ({ __esModule: true, default: () => <div>Sign in route</div> }));
jest.mock('../pages/SignUpPage', () => ({ __esModule: true, default: () => <div>Sign up route</div> }));
jest.mock('../pages/ForgotPasswordPage', () => ({ __esModule: true, default: () => <div>Forgot password route</div> }));
jest.mock('../pages/TeamsPage', () => ({ __esModule: true, default: () => <div>Teams route</div> }));
jest.mock('../pages/TeamDetailPage', () => ({ __esModule: true, default: () => <div>Team detail route</div> }));
jest.mock('../pages/DriversPage', () => ({ __esModule: true, default: () => <div>Drivers route</div> }));
jest.mock('../pages/DriverDetailPage', () => ({ __esModule: true, default: () => <div>Driver detail route</div> }));
jest.mock('../components/RequireAuth', () => ({
  __esModule: true,
  default: ({ children }) => children,
}));

function renderRoutes(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>
  );
}

describe('AppRoutes', () => {
  test.each([
    ['/teams', 'Teams route'],
    ['/team/red-bull', 'Team detail route'],
    ['/drivers', 'Drivers route'],
    ['/driver/max-verstappen', 'Driver detail route'],
  ])('renders %s with its public route component', (path, page) => {
    renderRoutes(path);

    expect(screen.getByText(page)).toBeInTheDocument();
  });
});
