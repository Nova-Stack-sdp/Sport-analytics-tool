import { useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import TopNav from './components/TopNavigation';
import AppRoutes from './navigation/AppRoutes';

function App() {
  const [theme, setTheme] = useState('dark'); // defaults dark, matching the mockup and docs site

  return (
    <div className="app-shell" data-theme={theme}>
      <BrowserRouter>
        <TopNav
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        />
        <AppRoutes />
      </BrowserRouter>
    </div>
  );
}

export default App;