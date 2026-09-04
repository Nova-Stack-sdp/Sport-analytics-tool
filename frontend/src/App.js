import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import TopNav from './components/TopNavigation';
import AppRoutes from './navigation/AppRoutes';
import { AuthProvider } from './context/AuthContext';

const THEME_STORAGE_KEY = 'f1-analytics-theme';

function AppShell({ theme, onToggleTheme }) {
  return (
    <>
      <TopNav theme={theme} onToggleTheme={onToggleTheme} />
      <AppRoutes />
    </>
  );
}

function App() {
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'dark';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return (
    <div className="app-shell" data-theme={theme}>
      <BrowserRouter>
        <AuthProvider>
          <AppShell
            theme={theme}
            onToggleTheme={() => setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))}
          />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
