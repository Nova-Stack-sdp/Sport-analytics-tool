import { NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/overview', label: 'Overview' },
  { to: '/fixtures', label: 'Fixtures & Events' },
  { to: '/statistics', label: 'Statistics' },
  { to: '/submissions', label: 'Submissions', requiresAuth: true },
  { to: '/timetravel', label: 'Time-Travel' },
  { to: '/datasets', label: 'Datasets', requiresAuth: true },
  { to: '/developer', label: 'Developer', requiresAuth: true },
  { to: '/admin', label: 'Admin', requiresAuth: true },
];

function navItemClass({ isActive }) {
  return `nav-item${isActive ? ' active' : ''}`;
}

function initialsFor(user) {
  const source = user.displayName || user.email || '?';
  return source.trim().charAt(0).toUpperCase();
}

function TopNav({ theme, onToggleTheme }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/sign-in', { replace: true });
  };

  return (
    <div className="topnav" aria-label="Main navigation">
      <div className="topnav-inner">
        <NavLink to="/" className="brand" style={{ textDecoration: 'none' }}>
          <div className="brand-mark">F1</div>
          <div className="brand-text">Analytics</div>
        </NavLink>
        <div className="nav-items">
          {NAV_ITEMS.filter((item) => !item.requiresAuth || user).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navItemClass}>
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className="topnav-right">
          <div className="live-pill live-blink">LIVE</div>
          <div className="season-pill">2026 Season ▾</div>
          <button className="theme-toggle" title="Toggle dark mode" onClick={onToggleTheme}>
            <span>{theme === 'dark' ? '☀' : '☾'}</span>
          </button>
          {user ? (
            <button
              className="avatar"
              title={`Signed in as ${user.email ?? user.displayName ?? 'you'} · Sign out`}
              onClick={handleSignOut}
              type="button"
            >
              {initialsFor(user)}
            </button>
          ) : (
            <NavLink to="/sign-in" className="avatar" title="Sign in">
              SignIn
            </NavLink>
          )}
        </div>
      </div>
    </div>
  );
}

export default TopNav;