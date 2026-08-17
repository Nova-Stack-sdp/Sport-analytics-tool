import { Route, Routes } from 'react-router-dom';
import OverviewPage from '../pages/OverviewPage';
import FixturesEventsPage from '../pages/FixturesEventsPage';
import StatisticsPage from '../pages/StatisticsPage';
import SubmissionsPage from '../pages/SubmissionsPage';
import TimeTravelPage from '../pages/TimeTravelPage';
import DatasetsPage from '../pages/DatasetsPage';
import DeveloperPage from '../pages/DeveloperPage';
import SignInPage from '../pages/SignInPage';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<OverviewPage />} />
      <Route path="/fixtures" element={<FixturesEventsPage />} />
      <Route path="/statistics" element={<StatisticsPage />} />
      <Route path="/submissions" element={<SubmissionsPage />} />
      <Route path="/timetravel" element={<TimeTravelPage />} />
      <Route path="/datasets" element={<DatasetsPage />} />
      <Route path="/developer" element={<DeveloperPage />} />
      <Route path="/sign-in" element={<SignInPage />} />
    </Routes>
  );
}

export default AppRoutes;