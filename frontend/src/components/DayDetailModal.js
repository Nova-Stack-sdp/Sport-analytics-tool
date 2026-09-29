import { useEffect } from 'react';

const SESSION_LABELS = {
  FP1: 'Practice 1',
  FP2: 'Practice 2',
  FP3: 'Practice 3',
  Q: 'Qualifying',
  SPRINT: 'Sprint',
  RACE: 'Race',
};

const LORE_ICONS = { birthday: '🎂', lore: '🧩' };

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

// Shown when a calendar day is clicked — the sessions running that day (if
// any) plus any birthday/lore entries for people the user follows that
// land on this date.
function DayDetailModal({ date, sessions, loreEvents, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const dateLabel = new Intl.DateTimeFormat('en-ZA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);

  const isEmpty = sessions.length === 0 && loreEvents.length === 0;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal-panel day-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label={dateLabel}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{dateLabel}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {isEmpty && <p className="secondary">Nothing tracked for this date.</p>}

        {sessions.length > 0 && (
          <div className="day-detail-section">
            <h3>Sessions</h3>
            <ul className="day-detail-list">
              {sessions.map((session) => (
                <li key={session.id}>
                  <span className="day-detail-time">{formatTime(session.startTime)}</span>
                  <span className="day-detail-body">
                    <b>{SESSION_LABELS[session.type] || session.type}</b>
                    <span className="following-sub"> · {session.meetingName}</span>
                    {session.country && <span className="following-sub"> · {session.country}</span>}
                  </span>
                  <span className={`pill pill-${session.status === 'live' ? 'red' : session.status === 'finished' ? 'gray' : 'amber'}`}>
                    {session.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {loreEvents.length > 0 && (
          <div className="day-detail-section">
            <h3>Following</h3>
            <ul className="day-detail-list">
              {loreEvents.map((event) => (
                <li key={event.title}>
                  <span className="day-detail-icon">{LORE_ICONS[event.type] || '📌'}</span>
                  <span className="day-detail-body">
                    <b>{event.title}</b>
                    <span className="day-detail-note">{event.note}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default DayDetailModal;