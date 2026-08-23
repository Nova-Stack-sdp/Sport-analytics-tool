import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    // Avoid a flash-redirect to /sign-in while Firebase is still restoring
    // a persisted session on first load.
    return <div className="page secondary">Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }

  return children;
}

export default RequireAuth;