import { useEffect, useMemo, useState } from 'react';
import { getFixtures } from '../api/client';
import { LORE_EVENTS, matchesFollows } from '../data/f1Lore';
import DayDetailModal from './DayDetailModal';

const SESSION_LABELS = {
  FP1: 'FP1',
  FP2: 'FP2',
  FP3: 'FP3',
  Q: 'Quali',
  SPRINT: 'Sprint',
  RACE: 'Race',
};

// Cycled per race weekend (by order of appearance) purely to give each
// Grand Prix a distinct accent stripe on the days it runs, the way the
// reference calendar uses a different flag colour per weekend.
const WEEKEND_COLORS = ['#06B6D4', '#F59E0B', '#8B5CF6', '#EC4899', '#22C55E', '#3B82F6', '#F97316', '#84CC16'];

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function sessionLabel(type) {
  return SESSION_LABELS[type] || type;
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

function formatFullDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

// Monday-first 6-week grid covering the viewed month plus the leading/
// trailing days needed to fill whole weeks, matching a standard wall
// calendar layout.
function buildMonthGrid(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - mondayOffset);

  const days = [];
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    days.push({ date: day, inMonth: day.getMonth() === month });
  }
  return days;
}

// Groups the flat fixtures list by race weekend, assigns each weekend a
// colour, and indexes every session date so the grid can look each day up
// in O(1) while rendering.
function buildWeekendData(fixtures) {
  const meetings = new Map();
  fixtures.forEach((fixture) => {
    const key = `${fixture.season}-${fixture.meetingName}`;
    if (!meetings.has(key)) {
      meetings.set(key, { key, meetingName: fixture.meetingName, country: fixture.country, sessions: [] });
    }
    meetings.get(key).sessions.push(fixture);
  });

  const sortedMeetings = Array.from(meetings.values()).sort(
    (a, b) => new Date(a.sessions[0].startTime) - new Date(b.sessions[0].startTime)
  );

  const sessionsByDate = new Map();
  sortedMeetings.forEach((meeting, index) => {
    const color = WEEKEND_COLORS[index % WEEKEND_COLORS.length];
    meeting.sessions.forEach((session) => {
      const key = dateKey(new Date(session.startTime));
      if (!sessionsByDate.has(key)) sessionsByDate.set(key, []);
      sessionsByDate.get(key).push({ ...session, color, meetingName: meeting.meetingName });
    });
  });

  return { sortedMeetings, sessionsByDate };
}

function ProfileCalendar({ follows }) {
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(null);

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

  const { sortedMeetings, sessionsByDate } = useMemo(() => buildWeekendData(fixtures), [fixtures]);
  const grid = useMemo(() => buildMonthGrid(viewDate), [viewDate]);
  const todayKey = dateKey(new Date());

  // Only lore for drivers/teams this user actually follows ever reaches the
  // calendar — nothing shows up for anyone they don't follow.
  const followedLoreEvents = useMemo(
    () => LORE_EVENTS.filter((entry) => matchesFollows(entry, follows?.drivers || [], follows?.teams || [])),
    [follows]
  );
  const loreByMonthDay = useMemo(() => {
    const map = new Map();
    followedLoreEvents.forEach((entry) => {
      const key = `${entry.month}-${entry.day}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    });
    return map;
  }, [followedLoreEvents]);

  const nextSession = useMemo(() => {
    const now = Date.now();
    return sortedMeetings
      .flatMap((meeting) => meeting.sessions.map((session) => ({ ...session, meetingName: meeting.meetingName })))
      .filter((session) => new Date(session.startTime).getTime() >= now)
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))[0];
  }, [sortedMeetings]);

  const monthLabel = new Intl.DateTimeFormat('en-ZA', { month: 'long', year: 'numeric' }).format(viewDate);

  const goToMonth = (delta) => {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };
  const goToToday = () => {
    const now = new Date();
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  if (loading) return <p className="secondary">Loading calendar…</p>;
  if (error) {
    return (
      <div className="rationale">
        <span className="ic">⚠</span>
        <div><b>Couldn't load the calendar:</b> {error}</div>
      </div>
    );
  }

  return (
    <div className="f1-calendar">
      {nextSession && (
        <div className="f1-calendar-next">
          <span className="f1-calendar-next-label">Next up</span>
          <span className="f1-calendar-next-body">
            <b>{sessionLabel(nextSession.type)}</b> · {nextSession.meetingName} — {formatFullDate(nextSession.startTime)} at {formatTime(nextSession.startTime)}
          </span>
        </div>
      )}

      <div className="f1-calendar-card">
        <div className="f1-calendar-head">
          <div className="f1-calendar-head-bar" />
          <h2>{monthLabel}</h2>
          <div className="f1-calendar-nav">
            <button type="button" onClick={() => goToMonth(-1)} aria-label="Previous month">‹</button>
            <button type="button" onClick={goToToday}>Today</button>
            <button type="button" onClick={() => goToMonth(1)} aria-label="Next month">›</button>
          </div>
        </div>

        <div className="f1-calendar-weekdays">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label}>{label}</div>
          ))}
        </div>

        <div className="f1-calendar-grid">
          {grid.map(({ date, inMonth }) => {
            const key = dateKey(date);
            const sessions = sessionsByDate.get(key) || [];
            const dayLore = loreByMonthDay.get(`${date.getMonth() + 1}-${date.getDate()}`) || [];
            const accentColor = sessions[0]?.color;
            const hasContent = sessions.length > 0 || dayLore.length > 0;
            return (
              <button
                type="button"
                key={key}
                className={`f1-calendar-day${inMonth ? '' : ' is-outside'}${key === todayKey ? ' is-today' : ''}`}
                style={accentColor ? { '--weekend-color': accentColor } : undefined}
                onClick={() => hasContent && setSelectedDay({ date, sessions, loreEvents: dayLore })}
              >
                <span className="f1-calendar-daynum">
                  {date.getDate()}
                  {dayLore.length > 0 && <span className="f1-calendar-lore-dot" title="Following" />}
                </span>
                {sessions.length > 0 && (
                  <div className="f1-calendar-sessions">
                    {sessions.map((session) => (
                      <span key={session.id} className={`f1-calendar-session status-${session.status}`}>
                        {formatTime(session.startTime)} {sessionLabel(session.type)}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <DayDetailModal
          date={selectedDay.date}
          sessions={selectedDay.sessions}
          loreEvents={selectedDay.loreEvents}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

export default ProfileCalendar;