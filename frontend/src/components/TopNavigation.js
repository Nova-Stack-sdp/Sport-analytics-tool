import { NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useDeveloperMode } from '../context/DeveloperModeContext';
import { clearSession } from '../api/client';

const NAV_ITEMS = [
  { to: '/overview', label: 'Overview' },
  { to: '/fixtures', label: 'Fixtures & Events' },
  { to: '/statistics', label: 'Statistics' },
  { to: '/teams', label: 'Teams' },
  { to: '/drivers', label: 'Drivers' },
  { to: '/timetravel', label: 'Time-Travel' },
  { to: '/replay', label: 'Race Replay' },
  // Datasets and Submissions are developer-only — a signed-in user who
  // hasn't switched on developer mode shouldn't see them in the nav at
  // all (the route itself also redirects, this just keeps the nav honest).
  { to: '/datasets', label: 'Datasets', requiresAuth: true, requiresDeveloper: true },
  { to: '/submissions', label: 'Submissions', requiresAuth: true, requiresDeveloper: true },
  // Developer is visible to every signed-in user — it explains the role
  // and how to turn it on for those who don't have it yet.
  { to: '/developer', label: 'Developer', requiresAuth: true },
  { to: '/settings', label: 'Settings', requiresAuth: true },
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
  const { user, signOut: clearAuth } = useAuth();
  const { isDeveloperMode } = useDeveloperMode();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    // Clear both auth layers: Firebase client session and the backend
    // httpOnly cookie.  Clear the context immediately so the UI
    // updates before the redirect.
    clearAuth();
    // allSettled, not all: signing out locally must not depend on the
    // backend being reachable.  When the API is down or blocked, fetch
    // rejects with a TypeError ("Failed to fetch") — under Promise.all
    // that rejection skipped the redirect below and surfaced as an
    // unhandled runtime error (CRA's dev overlay), stranding the user on
    // the page even though they were already signed out client-side.
    const [, sessionResult] = await Promise.allSettled([signOut(auth), clearSession()]);
    if (sessionResult.status === 'rejected') {
      // The httpOnly cookie outlives this call (7-day max-age), so a
      // failure here is worth knowing about — but it must not block the
      // redirect.
      console.warn('Sign-out: could not clear the backend session cookie.', sessionResult.reason);
    }
    navigate('/', { replace: true });
  };

  return (
    <div className="topnav" aria-label="Main navigation">
      <div className="topnav-inner">
        <NavLink to="/" className="brand" style={{ textDecoration: 'none' }}>
          <div className="brand-mark">F1</div>
          <div className="brand-text">Analytics</div>
        </NavLink>
        <div className="nav-items">
          {NAV_ITEMS.filter((item) => {
            if (item.requiresAuth && !user) return false;
            if (item.requiresDeveloper && !isDeveloperMode) return false;
            return true;
          }).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navItemClass}>
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className="topnav-right">
          <NavLink to="/watch-live" className="live-pill live-blink" title="Watch live">
            LIVE
          </NavLink>
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