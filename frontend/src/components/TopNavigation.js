import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/fixtures', label: 'Fixtures & Events' },
  { to: '/statistics', label: 'Statistics' },
  { to: '/submissions', label: 'Submissions' },
  { to: '/timetravel', label: 'Time-Travel' },
  { to: '/datasets', label: 'Datasets' },
  { to: '/developer', label: 'Developer' },
  { to: '/admin', label: 'Admin' },
];

function navItemClass({ isActive }) {
  return `nav-item${isActive ? ' active' : ''}`;
}

function TopNavigation({ theme, onToggleTheme }) {
  return (
    <div className="topnav" aria-label="Main navigation">
      <div className="topnav-inner">
        <div className="brand">
          <div className="brand-mark">F1</div>
          <div className="brand-text">Analytics</div>
        </div>
        <div className="nav-items">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navItemClass}>
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className="topnav-right">
          <div className="live-pill live-blink">LIVE</div>
          <div className="season-pill">2026 Season ▾</div>
          <button className="theme-toggle" title="Toggle dark mode" onClick={onToggleTheme}>
            <span>{theme === 'dark' ? '☀' : '🌙'}</span>
          </button>
          <NavLink to="/sign-in" className="avatar" title="Sign in">SignIN</NavLink>
        </div>
      </div>
    </div>
  );
}

export default TopNavigation;