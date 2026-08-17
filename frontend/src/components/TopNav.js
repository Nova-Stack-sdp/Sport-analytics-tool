import React from 'react';

const NAV_ITEMS = [
  { key: 'overview', label: 'Overview' },
  { key: 'fixtures', label: 'Fixtures & Events' },
  { key: 'statistics', label: 'Statistics' },
  { key: 'submissions', label: 'Submissions' },
  { key: 'timetravel', label: 'Time-Travel' },
  { key: 'datasets', label: 'Datasets' },
  { key: 'developer', label: 'Developer' },
];

export default function TopNav({ currentPage, onNavigate, theme, onToggleTheme }) {
  return (
    <div className="topnav">
      <div className="topnav-inner">
        <div className="brand">
          <div className="brand-mark">F1</div>
          <div className="brand-text">Analytics</div>
        </div>
        <div className="nav-items">
          {NAV_ITEMS.map((item) => (
            <div
              key={item.key}
              className={`nav-item${currentPage === item.key ? ' active' : ''}`}
              onClick={() => onNavigate(item.key)}
            >
              {item.label}
            </div>
          ))}
        </div>
        <div className="topnav-right">
          <div className="live-pill live-blink">LIVE</div>
          <div className="season-pill">2026 Season ▾</div>
          <button
            className="theme-toggle"
            title="Toggle dark mode"
            onClick={onToggleTheme}
          >
            <span>{theme === 'dark' ? '☀' : '🌙'}</span>
          </button>
          <div className="avatar">NS</div>
        </div>
      </div>
    </div>
  );
}