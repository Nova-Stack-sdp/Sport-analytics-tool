import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import TopNav from './components/TopNavigation';
import AppRoutes from './navigation/AppRoutes';
import { AuthProvider } from './context/AuthContext';
import { DeveloperModeProvider } from './context/DeveloperModeContext';
import { PreferencesProvider, usePreferences } from './context/PreferencesContext';

function AppShell() {
  const { preferences, resolvedTheme, updatePreference } = usePreferences();

  // Theme, density and motion are applied as attributes on <html> so plain
  // CSS can react to them (see globals.css). Theme is also mirrored on the
  // .app-shell div, which is where it has always been set.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.density = preferences.density;
    root.dataset.reduceMotion = String(preferences.reduceMotion);
  }, [resolvedTheme, preferences.density, preferences.reduceMotion]);

  return (
    <div
      className="app-shell"
      data-theme={resolvedTheme}
      data-density={preferences.density}
      data-reduce-motion={String(preferences.reduceMotion)}
    >
      <BrowserRouter>
        <AuthProvider>
          <DeveloperModeProvider>
            <TopNav
              theme={resolvedTheme}
              // The nav's ☀/☾ button is a quick flip between light and dark;
              // it sets an explicit theme (leaving "Match system" if it was on).
              onToggleTheme={() => updatePreference('theme', resolvedTheme === 'dark' ? 'light' : 'dark')}
            />
            <AppRoutes />
          </DeveloperModeProvider>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

function App() {
  return (
    <PreferencesProvider>
      <AppShell />
    </PreferencesProvider>
  );
}

export default App;
