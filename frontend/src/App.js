import { BrowserRouter } from 'react-router-dom';
import TopNavigation from './components/TopNavigation';
import AppRoutes from './navigation/AppRoutes';

function App() {
  return (
    <BrowserRouter>
      <TopNavigation />
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
