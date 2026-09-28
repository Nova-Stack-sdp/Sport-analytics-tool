import { useEffect, useMemo, useState } from 'react';
import { getFixtures } from '../api/client';

const SESSION_LABELS = {
  FP1: 'Practice 1',
  FP2: 'Practice 2',
  FP3: 'Practice 3',
  Q: 'Qualifying',
  SPRINT: 'Sprint',
  RACE: 'Race',
};

function sessionLabel(type) {
  return SESSION_LABELS[type] || type;
}

function formatMeetingDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short' }).format(date);
}

// The fixtures endpoint returns one row per session — group them back into
// race weekends (a "meeting") so the calendar reads one row per Grand Prix
// with its sessions as a row of chips, not one row per session.
function groupByMeeting(fixtures) {
  const groups = new Map();
  fixtures.forEach((fixture) => {
    const key = `${fixture.season}-${fixture.meetingName}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        meetingName: fixture.meetingName,
        circuitName: fixture.circuitName,
        country: fixture.country,
        sessions: [],
      });
    }
    groups.get(key).sessions.push(fixture);
  });

  return Array.from(groups.values())
    .map((meeting) => {
      const sessions = [...meeting.sessions].sort(
        (a, b) => new Date(a.startTime) - new Date(b.startTime)
      );
      return { ...meeting, sessions, startTime: sessions[0].startTime };
    })
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
}

function ProfileCalendar() {
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getFixtures()
      .then((result) => {
        if (!cancelled) setFixtures(result.fixtures || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const meetings = useMemo(() => groupByMeeting(fixtures), [fixtures]);
  const nextMeetingKey = useMemo(() => {
    const now = Date.now();
    return meetings.find((meeting) => new Date(meeting.startTime).getTime() >= now)?.key;
  }, [meetings]);

  if (loading) return <p className="secondary">Loading calendar…</p>;
  if (error) {
    return (
      <div className="rationale">
        <span className="ic">⚠</span>
        <div><b>Couldn't load the calendar:</b> {error}</div>
      </div>
    );
  }
  if (meetings.length === 0) return <p className="secondary">No sessions are tracked yet.</p>;

  return (
    <div className="calendar-list">
      {meetings.map((meeting) => (
        <div
          key={meeting.key}
          className={`calendar-meeting${meeting.key === nextMeetingKey ? ' is-next' : ''}`}
        >
          <div className="calendar-meeting-date">
            <span>{formatMeetingDate(meeting.startTime)}</span>
            {meeting.key === nextMeetingKey && <span className="pill pill-red">Next race</span>}
          </div>
          <div className="calendar-meeting-info">
            <div className="calendar-meeting-name">{meeting.meetingName}</div>
            <div className="calendar-meeting-place">{meeting.circuitName} · {meeting.country}</div>
            <div className="calendar-session-row">
              {meeting.sessions.map((session) => (
                <span key={session.id} className={`calendar-session-chip status-${session.status}`}>
                  {sessionLabel(session.type)}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default ProfileCalendar;
