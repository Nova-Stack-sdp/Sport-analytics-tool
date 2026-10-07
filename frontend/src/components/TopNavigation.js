import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useDeveloperMode } from '../context/DeveloperModeContext';
import { clearSession } from '../api/client';
import { resetFollowCache } from '../services/followService';
import { readLocalProfile, subscribeToLocalProfile } from '../services/userProfile';

const NAV_ITEMS = [
  { to: '/overview', label: 'Overview' },
  { to: '/fixtures', label: 'Fixtures & Events' },
  { to: '/statistics', label: 'Statistics' },
  { to: '/teams', label: 'Teams' },
  { to: '/drivers', label: 'Drivers' },
  { to: '/timetravel', label: 'Time-Travel' },
  { to: '/replay', label: 'Race Replay' },
  // Developer is visible to every signed-in user — it explains the role
  // and how to turn it on for those who don't have it yet. Datasets and
  // Submit Code are tabs inside it (developer mode only), not nav items.
  { to: '/developer', label: 'Developer', requiresAuth: true },
  // Profile sits where Settings used to — Settings is now a tab inside it.
  { to: '/profile', label: 'Profile', requiresAuth: true },
  // Only for UIDs on the backend's ADMIN_UIDS list (see AuthContext).
  { to: '/admin', label: 'Admin', requiresAuth: true, requiresAdmin: true },
];

function navItemClass({ isActive }) {
  return `nav-item${isActive ? ' active' : ''}`;
}

function initialsFor(user) {
  const source = user.displayName || user.email || '?';
  return source.trim().charAt(0).toUpperCase();
}

function TopNav({ theme, onToggleTheme }) {
  const { user, isAdmin, signOut: clearAuth } = useAuth();
  const { isDeveloperMode } = useDeveloperMode();
  const navigate = useNavigate();
  // The avatar opens an account menu rather than signing the user straight
  // out, and logging out then has to be confirmed — a stray click on the
  // avatar used to end the session immediately.
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingLogOut, setConfirmingLogOut] = useState(false);
  
  // --- NEW: Notifications State ---
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const bellRef = useRef(null);

  // Notifications state
  const [notifications, setNotifications] = useState([]);
  const unreadCount = notifications.filter(n => !n.isRead).length;

  // Helper function to fetch notifications safely
  const fetchNavNotifications = useCallback(async () => {
    if (!user) return; // Don't fetch if unauthenticated

    try {
      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';
      const response = await fetch(`${API_URL}/api/notifications`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // CRITICAL: Send HTTP-only session cookie
      });

      if (response.ok) {
        const data = await response.json();
        setNotifications(data);
      }
    } catch (err) {
      console.error('Failed to fetch notifications for nav', err);
    }
  }, [user]);

  // 1. Fetch on mount / user auth state change
  useEffect(() => {
    fetchNavNotifications();
  }, [fetchNavNotifications]);

  // 2. Handle Bell Click: Toggle dropdown AND fetch fresh notifications
  const handleBellClick = () => {
    if (menuOpen) closeMenu();
    
    const nextState = !notificationsOpen;
    setNotificationsOpen(nextState);

    // Re-fetch when opening the dropdown so data is always fresh and session timing issues are bypassed
    if (nextState) {
      fetchNavNotifications();
    }
  };
  
  const [localProfile, setLocalProfile] = useState(() => readLocalProfile(user));
  const menuRef = useRef(null);
  const avatarRef = useRef(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    const refreshLocalProfile = () => setLocalProfile(readLocalProfile(user));
    refreshLocalProfile();
    return subscribeToLocalProfile(user?.uid, refreshLocalProfile);
  }, [user]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setConfirmingLogOut(false);
  }, []);

  const handleSignOut = async () => {
    // Clear both auth layers: Firebase client session and the backend
    // httpOnly cookie.  Clear the context immediately so the UI
    // updates before the redirect.
    clearAuth();
    resetFollowCache();
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

  // Confirming is the only path to handleSignOut, so nothing is lost when
  // the menu closes first.
  const handleLogOutConfirmed = () => {
    closeMenu();
    handleSignOut();
  };

  // Dismiss the menu on an outside click or Escape — Escape hands focus back
  // to the avatar so keyboard users don't lose their place.
  useEffect(() => {
    if (!menuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) closeMenu();
    };
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      closeMenu();
      avatarRef.current?.focus();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen, closeMenu]);
  

  // Swapping "Log out" for the Yes/No pair removes the focused element, so
  // focus is moved onto the question to keep it announced and reachable.
  useEffect(() => {
    if (confirmingLogOut) confirmRef.current?.focus();
  }, [confirmingLogOut]);

  // Firebase syncs sign-out across tabs, so the identity can change while
  // the menu is open — never let a stale menu greet the next sign-in.
  useEffect(() => {
    closeMenu();
  }, [user, closeMenu]);

  const identity = user ? user.email ?? user.displayName ?? 'you' : null;
  const avatarUser = user ? {
    ...user,
    displayName: localProfile.displayName || user.displayName,
  } : null;

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
            if (item.requiresAdmin && !isAdmin) return false;
            return true;
          }).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navItemClass}>
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className="topnav-right">
          <NavLink to="/telemetry-tv" className="live-pill live-blink" title="TelemetryTV">
            TelemetryTV
          </NavLink>
          <button className="theme-toggle" title="Toggle dark mode" onClick={onToggleTheme}>
            <span>{theme === 'dark' ? '☀' : '☾'}</span>
          </button>
          {user ? (
            <>
            {/* Notification Bell */}
              <div className="notification-wrap" ref={bellRef}>
                <button
                  className="notification-bell"
                  title="Notifications"
                  aria-expanded={notificationsOpen}
                  onClick={handleBellClick} // Updated click handler
                >
                  <span aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                  </span>
                  {unreadCount > 0 && (
                    <span className="notification-badge">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="notification-menu avatar-menu">
                    <h4>Updates</h4>
                    
                    <div className="notification-list">
                      {notifications.length === 0 ? (
                        <div className="notification-item" style={{ padding: '0.5rem 1rem' }}>
                          No new updates
                        </div>
                      ) : (
                        notifications.slice(0, 4).map(n => (
                          <div 
                            key={n.id} 
                            className="notification-item" 
                            style={{ 
                              padding: '0.5rem 1rem', 
                              borderBottom: '1px solid var(--border-color, #eee)',
                              fontWeight: n.isRead ? 'normal' : 'bold'
                            }}
                          >
                            <strong>{n.title}</strong><br/>
                            <span style={{ fontSize: '0.85em', opacity: 0.8 }}>{n.message}</span>
                          </div>
                        ))
                      )}
                    </div>

                    <NavLink 
                      to="/profile" 
                      className="avatar-menu-button" 
                      onClick={() => setNotificationsOpen(false)}
                    >
                      View all in Profile
                    </NavLink>
                  </div>
                )}
              </div>
              {/* --- END Notification Bell --- */}
            <div className="avatar-wrap" ref={menuRef}>
              <button
                className="avatar"
                ref={avatarRef}
                title={`Signed in as ${identity}`}
                aria-expanded={menuOpen}
                onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
                type="button"
              >
                {localProfile.photoDataUrl
                  ? <img src={localProfile.photoDataUrl} alt="" />
                  : initialsFor(avatarUser)}
              </button>
              {menuOpen && (
                <div className="avatar-menu">
                  <p className="avatar-menu-identity">Signed in as {identity}</p>
                  <NavLink
                    to="/profile"
                    className="avatar-menu-button"
                    onClick={closeMenu}
                  >
                    View profile
                  </NavLink>
                  {confirmingLogOut ? (
                    <div
                      className="avatar-menu-confirm"
                      ref={confirmRef}
                      role="group"
                      aria-label="Confirm log out"
                      tabIndex={-1}
                    >
                      <p className="avatar-menu-question">Are you sure you want to log out?</p>
                      <div className="avatar-menu-actions">
                        <button
                          className="avatar-menu-button is-primary"
                          onClick={handleLogOutConfirmed}
                          type="button"
                        >
                          Yes
                        </button>
                        <button
                          className="avatar-menu-button is-secondary"
                          onClick={() => {
                            // "No" only clears the question — the session
                            // and the cookie are left untouched.
                            closeMenu();
                            avatarRef.current?.focus();
                          }}
                          type="button"
                        >
                          No
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="avatar-menu-button"
                      onClick={() => setConfirmingLogOut(true)}
                      type="button"
                    >
                      Log out
                    </button>
                  )}
                </div>
              )}
            </div>
            </>
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