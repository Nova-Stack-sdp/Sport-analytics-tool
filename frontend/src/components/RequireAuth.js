import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDeveloperMode } from '../context/DeveloperModeContext';

// Guards a route behind the signed-in state, and optionally a role on
// top of that. `role="developer"` is the only role this component knows
// about for now — admin gating is deferred (see project notes: the
// admin role will be wired through Firebase custom claims later, and
// isn't part of this pass).
//
// A signed-in user who lacks the required role is sent to /developer
// rather than /sign-in — they ARE allowed in the app, they're just
// missing a role, so the useful place to land them is the page that
// explains how to get that role, not the sign-in screen.
function RequireAuth({ children, role }) {
  const { user, loading } = useAuth();
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

  return children;
}

export default RequireAuth;