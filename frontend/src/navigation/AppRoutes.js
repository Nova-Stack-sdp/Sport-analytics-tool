import { Navigate, Route, Routes } from 'react-router-dom';
import WelcomePage from '../pages/WelcomePage';
import OverviewPage from '../pages/OverviewPage';
import FixturesEventsPage from '../pages/FixturesEventsPage';
import StatisticsPage from '../pages/StatisticsPage';
import TimeTravelPage from '../pages/TimeTravelPage';
import DeveloperPage from '../pages/DeveloperPage';
import ApiDocsPage from '../pages/ApiDocsPage';
import AdminPage from '../pages/AdminPage';
import ProfilePage from '../pages/ProfilePage';
import WatchLivePage from '../pages/WatchLivePage';
import SignInPage from '../pages/SignInPage';
import SignUpPage from '../pages/SignUpPage';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';
import TeamsPage from '../pages/TeamsPage';
import TeamDetailPage from '../pages/TeamDetailPage';
import DriversPage from '../pages/DriversPage';
import DriverDetailPage from '../pages/DriverDetailPage';
import RaceReplayPage from '../pages/RaceReplayPage';
import RequireAuth from '../components/RequireAuth';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/sign-up" element={<SignUpPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      <Route path="/overview" element={<OverviewPage />} />
      <Route path="/fixtures" element={<FixturesEventsPage />} />
      <Route path="/statistics" element={<StatisticsPage />} />
      {/* Datasets and Submissions are tabs on the Developer page now. */}
      <Route path="/submissions" element={<Navigate to="/developer?tab=submissions" replace />} />
      <Route path="/timetravel" element={<TimeTravelPage />} />
      <Route path="/datasets" element={<Navigate to="/developer?tab=datasets" replace />} />
      <Route path="/developer" element={<RequireAuth><DeveloperPage /></RequireAuth>} />
      <Route path="/developer/api-docs" element={<RequireAuth role="developer"><ApiDocsPage /></RequireAuth>} />
      {/* Settings now lives as a tab on Profile — keep old links working. */}
      <Route path="/settings" element={<Navigate to="/profile?tab=settings" replace />} />
      <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth role="admin"><AdminPage /></RequireAuth>} />

      <Route path="/teams" element={<TeamsPage />} />
      <Route path="/team/:id" element={<TeamDetailPage />} />
      <Route path="/drivers" element={<DriversPage />} />
      <Route path="/driver/:id" element={<DriverDetailPage />} />
      <Route path="/watch-live" element={<WatchLivePage />} />
      <Route path="/replay" element={<RaceReplayPage />} />
    </Routes>
  );
}

export default AppRoutes;
