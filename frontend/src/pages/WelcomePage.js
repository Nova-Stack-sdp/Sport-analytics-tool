import { NavLink } from 'react-router-dom';
import HeroBanner from '../components/HeroBanner';
import { useAuth } from '../context/AuthContext';

const DESTINATIONS = [
  { to: '/overview', label: 'Overview' },
  { to: '/fixtures', label: 'Fixtures & Events' },
  { to: '/statistics', label: 'Statistics' },
  { to: '/submissions', label: 'Submissions', requiresAuth: true },
  { to: '/timetravel', label: 'Time-Travel' },
  { to: '/datasets', label: 'Datasets', requiresAuth: true },
  { to: '/developer', label: 'Developer', requiresAuth: true },
];

function navItemClass({ isActive }) {
  return `welcome-nav-item${isActive ? ' active' : ''}`;
}

function WelcomePage() {
  const { user } = useAuth();

  return (
    <div className="welcome-page">
      <div className="welcome-hero-wrap">
        <HeroBanner />
      </div>
      <nav className="welcome-bottom-nav" aria-label="Enter the platform">
        {DESTINATIONS.filter((d) => !d.requiresAuth || user).map((d) => (
          <NavLink key={d.to} to={d.to} className={navItemClass}>
            {d.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default WelcomePage;