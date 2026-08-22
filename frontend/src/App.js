import { useState } from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import TopNav from './components/TopNavigation';
import AppRoutes from './navigation/AppRoutes';

// The welcome page ("/") is a full-screen landing view with its own bottom
// nav, so the persistent top nav is hidden there and shown everywhere else.
function AppShell({ theme, onToggleTheme }) {
  const location = useLocation();
  const isWelcomePage = location.pathname === '/';

  return (
    <>
      {!isWelcomePage && (
        <TopNav theme={theme} onToggleTheme={onToggleTheme} />
      )}
      <AppRoutes />
    </>
  );
}

function App() {
  const [theme, setTheme] = useState('dark'); // defaults dark, matching the mockup and docs site

  return (
    <div className="app-shell" data-theme={theme}>
      <BrowserRouter>
        <AppShell
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        />
      </BrowserRouter>
    </div>
  );
}

export default App;