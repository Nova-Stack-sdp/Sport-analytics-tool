import { useEffect } from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import TopNav from './components/TopNavigation';
import RaceSyncHeader from './components/race-sync/RaceSyncHeader';
import RaceSyncNav from './components/race-sync/RaceSyncNav';
import { RaceSyncSelectionProvider } from './components/race-sync/RaceSyncSelection';
import AppRoutes from './navigation/AppRoutes';
import { AuthProvider } from './context/AuthContext';
import { DeveloperModeProvider } from './context/DeveloperModeContext';
import { PreferencesProvider, usePreferences } from './context/PreferencesContext';

// The RaceSync route swaps the app's top nav for its own chrome: a branded
// header bar over a local section rail (see raceSync.css). Every other route
// keeps the sticky top bar.
const RACESYNC_PATH = '/sync-f1-broadcast';

function AppFrame({ theme, onToggleTheme }) {
  const { pathname } = useLocation();
  const isRaceSync = pathname === RACESYNC_PATH;

  const content = (
    <>
      {isRaceSync ? (
        <>
          <RaceSyncHeader theme={theme} onToggleTheme={onToggleTheme} />
          <RaceSyncNav />
        </>
      ) : (
        <TopNav theme={theme} onToggleTheme={onToggleTheme} />
      )}
      <main className="app-frame-main">
        <AppRoutes />
      </main>
    </>
  );

  return (
    <div className={`app-frame${isRaceSync ? ' app-frame-racesync' : ''}${pathname === '/admin' ? ' app-frame-admin' : ''}`}>
      {/* The race search in the header writes the selection the page reads, so
          the provider has to wrap both halves of the frame. Context renders no
          DOM, so the header, rail and main stay direct grid children. */}
      {isRaceSync ? (
        <RaceSyncSelectionProvider>{content}</RaceSyncSelectionProvider>
      ) : (
        content
      )}
    </div>
  );
}

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
            <AppFrame
              theme={resolvedTheme}
              // The nav's ☀/☾ button is a quick flip between light and dark;
              // it sets an explicit theme (leaving "Match system" if it was on).
              onToggleTheme={() => updatePreference('theme', resolvedTheme === 'dark' ? 'light' : 'dark')}
            />
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
