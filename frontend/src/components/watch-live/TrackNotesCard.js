import { useState } from 'react';

// Displays circuit and session context with collapse affordance.
function TrackNotesCard({ trackData }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="card track-notes-card">
      <div className="card-head track-notes-head">
        <div className="track-notes-title">
          <div className="card-title">Circuit notes</div>
          <div className="card-title-sub">Track and session context</div>
        </div>
        <button
          className="track-notes-toggle"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? 'Expand' : 'Collapse'}
        >
          {isCollapsed ? '▶' : '▼'}
        </button>
      </div>

      {!isCollapsed && (
        <div className="track-notes-content">
          {trackData && Object.keys(trackData).length > 0 ? (
            <div className="track-notes-data">
              {trackData.description && (
                <p className="track-notes-text">{trackData.description}</p>
              )}
              {trackData.layout && (
                <div className="track-notes-item">
                  <span className="track-notes-label">Layout:</span>
                  <span className="track-notes-value">{trackData.layout}</span>
                </div>
              )}
              {trackData.turns && (
                <div className="track-notes-item">
                  <span className="track-notes-label">Turns:</span>
                  <span className="track-notes-value">{trackData.turns}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="track-notes-empty">
              Circuit and session context will appear here once loaded.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TrackNotesCard;
