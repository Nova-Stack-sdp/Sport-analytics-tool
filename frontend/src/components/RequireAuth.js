import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDeveloperMode } from '../context/DeveloperModeContext';

// Guards a route behind the signed-in state, and optionally a role on
// top of that:
//
//   role="developer" — the user's own developer-mode flag. Without it they
//     go to /developer, which explains how to turn it on (they ARE allowed
//     in the app, they're just missing a role — so not /sign-in).
//   role="admin" — the user's UID must be on the backend's ADMIN_UIDS list
//     (AuthContext asks the backend; see backend/src/lib/adminAccess.js).
//     Non-admins go to /overview: there's no way to request admin access
//     from the site, so there's nothing to explain.
function RequireAuth({ children, role }) {
  const { user, loading, isAdmin } = useAuth();
  const { isDeveloperMode } = useDeveloperMode();
  const location = useLocation();

  if (loading) {
    // Avoid a flash-redirect to /sign-in while Firebase is still restoring
    // a persisted session on first load.
    return <div className="page secondary">Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }

  if (role === 'developer' && !isDeveloperMode) {
    return <Navigate to="/developer" state={{ from: location }} replace />;
  }

  if (role === 'admin' && !isAdmin) {
    return <Navigate to="/overview" replace />;
  }

  return children;
}

export default RequireAuth;