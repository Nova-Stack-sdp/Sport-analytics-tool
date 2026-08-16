import { Route, Routes } from 'react-router-dom';
import OverviewPage from '../pages/OverviewPage';
import SignInPage from '../pages/SignInPage';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<OverviewPage />} />
      <Route path="/sign-in" element={<SignInPage />} />
    </Routes>
  );
}

export default AppRoutes;
