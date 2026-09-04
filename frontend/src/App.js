import { useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import TopNav from './components/TopNavigation';
import AppRoutes from './navigation/AppRoutes';
import { AuthProvider } from './context/AuthContext';

function AppShell({ theme, onToggleTheme }) {
  return (
    <>
      <TopNav theme={theme} onToggleTheme={onToggleTheme} />
      <AppRoutes />
    </>
  );
}

function App() {
  const [theme, setTheme] = useState('dark'); // defaults dark, matching the mockup and docs site

  return (
    <div className="app-shell" data-theme={theme}>
      <BrowserRouter>
        <AuthProvider>
          <AppShell
            theme={theme}
            onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
