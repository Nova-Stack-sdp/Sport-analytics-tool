import React, { useState } from 'react';
import './App.css';

import TopNav from './components/TopNav';
import Overview from './pages/Overview';
import FixturesEvents from './pages/FixturesEvents';
import Statistics from './pages/Statistics';
import Submissions from './pages/Submissions';
import TimeTravel from './pages/TimeTravel';
import Datasets from './pages/Datasets';
import Developer from './pages/Developer';

// NOTE: This is UI-only for now. All data on every page below is static
// mock data matching Challotte's wireframe (index_html.html) — nothing here
// is wired to the real backend yet. That happens once the backend team's
// endpoints exist; see the Developer page for the planned API surface.

const PAGES = {
  overview: Overview,
  fixtures: FixturesEvents,
  statistics: Statistics,
  submissions: Submissions,
  timetravel: TimeTravel,
  datasets: Datasets,
  developer: Developer,
};

function App() {
  const [currentPage, setCurrentPage] = useState('overview');
  const [theme, setTheme] = useState('dark'); // defaults dark, matching the mockup and the docs site

  const ActivePage = PAGES[currentPage];

  return (
    <div className="app-shell" data-theme={theme}>
      <TopNav
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      />
      <ActivePage onNavigate={setCurrentPage} />
    </div>
  );
}

export default App;