import { NavLink } from 'react-router-dom';
import HeroBanner from '../components/HeroBanner';

const DESTINATIONS = [
  { to: '/overview', label: 'Overview' },
  { to: '/fixtures', label: 'Fixtures & Events' },
  { to: '/statistics', label: 'Statistics' },
  { to: '/submissions', label: 'Submissions' },
  { to: '/timetravel', label: 'Time-Travel' },
  { to: '/datasets', label: 'Datasets' },
  { to: '/developer', label: 'Developer' },
];

function navItemClass({ isActive }) {
  return `welcome-nav-item${isActive ? ' active' : ''}`;
}

function WelcomePage() {
  return (
    <div className="welcome-page">
      <div className="welcome-hero-wrap">
        <HeroBanner />
      </div>
      <nav className="welcome-bottom-nav" aria-label="Enter the platform">
        {DESTINATIONS.map((d) => (
          <NavLink key={d.to} to={d.to} className={navItemClass}>
            {d.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default WelcomePage;