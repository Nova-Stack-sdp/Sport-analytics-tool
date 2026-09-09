import { Route, Routes } from 'react-router-dom';
import WelcomePage from '../pages/WelcomePage';
import OverviewPage from '../pages/OverviewPage';
import FixturesEventsPage from '../pages/FixturesEventsPage';
import StatisticsPage from '../pages/StatisticsPage';
import SubmissionsPage from '../pages/SubmissionsPage';
import TimeTravelPage from '../pages/TimeTravelPage';
import DatasetsPage from '../pages/DatasetsPage';
import DeveloperPage from '../pages/DeveloperPage';
import AdminPage from '../pages/AdminPage';
import WatchLivePage from '../pages/WatchLivePage';
import SignInPage from '../pages/SignInPage';
import SignUpPage from '../pages/SignUpPage';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';
import TeamsPage from '../pages/TeamsPage';
import TeamDetailPage from '../pages/TeamDetailPage';
import DriversPage from '../pages/DriversPage';
import DriverDetailPage from '../pages/DriverDetailPage';
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
      <Route path="/submissions" element={<RequireAuth><SubmissionsPage /></RequireAuth>} />
      <Route path="/timetravel" element={<TimeTravelPage />} />
      <Route path="/datasets" element={<RequireAuth><DatasetsPage /></RequireAuth>} />
      <Route path="/developer" element={<RequireAuth><DeveloperPage /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />

      <Route path="/teams" element={<TeamsPage />} />
      <Route path="/team/:id" element={<TeamDetailPage />} />
      <Route path="/drivers" element={<DriversPage />} />
      <Route path="/driver/:id" element={<DriverDetailPage />} />
      <Route path="/watch-live" element={<WatchLivePage />} />
    </Routes>
  );
}

export default AppRoutes;