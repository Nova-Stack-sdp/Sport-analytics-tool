import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WelcomePage from '../pages/WelcomePage';

let mockUser = null;
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../components/HeroBanner', () => () => <div>hero</div>);
jest.mock('../components/FeaturedVideos', () => () => <div>videos</div>);
jest.mock('../components/Faq', () => () => <div>faq</div>);
jest.mock('../components/Footer', () => () => <div>footer</div>);

const renderPage = () => render(<MemoryRouter><WelcomePage /></MemoryRouter>);

describe('WelcomePage', () => {
  beforeEach(() => { mockUser = null; });

  test('has a card for every public page, numbered in order', () => {
    const { container } = renderPage();
    const hrefs = [...container.querySelectorAll('.explore-card')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/overview', '/fixtures', '/statistics', '/timetravel', '/replay', '/drivers', '/teams', '/telemetry-tv']);
    const numbers = [...container.querySelectorAll('.explore-index')].map((n) => n.textContent);
    expect(numbers).toEqual(['01', '02', '03', '04', '05', '06', '07', '08']);
    expect(screen.queryByText(/Four ways/i)).not.toBeInTheDocument();
  });

  test('does not promise live data', () => {
    renderPage();
    expect(screen.queryByText(/live gaps|as it unfolds|right now/i)).not.toBeInTheDocument();
  });

  test('tells signed-out visitors what signing in really unlocks', () => {
    renderPage();
    expect(screen.getByText(/to follow drivers and teams/i)).toBeInTheDocument();
    expect(screen.getByText(/developer mode in Profile → Settings/i)).toBeInTheDocument();
    expect(screen.queryByText(/unlock Submissions, Datasets/i)).not.toBeInTheDocument();
  });

  test('hides the sign-in note when signed in', () => {
    mockUser = { uid: 'u1' };
    renderPage();
    expect(screen.queryByText(/to follow drivers and teams/i)).not.toBeInTheDocument();
  });
});
