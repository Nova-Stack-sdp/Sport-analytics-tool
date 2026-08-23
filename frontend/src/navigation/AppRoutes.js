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
import SignInPage from '../pages/SignInPage';
import SignUpPage from '../pages/SignUpPage';
import DashboardPage from '../pages/DashboardPage';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route path="/overview" element={<OverviewPage />} />
      <Route path="/fixtures" element={<FixturesEventsPage />} />
      <Route path="/statistics" element={<StatisticsPage />} />
      <Route path="/submissions" element={<SubmissionsPage />} />
      <Route path="/timetravel" element={<TimeTravelPage />} />
      <Route path="/datasets" element={<DatasetsPage />} />
      <Route path="/developer" element={<DeveloperPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/sign-up" element={<SignUpPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
    </Routes>
  );
}

export default AppRoutes;