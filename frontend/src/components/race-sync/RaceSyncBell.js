import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getNotifications, markNotificationRead } from '../../api/client';

// A moment of the notification's own clock, read as a timing screen reads
// one: "3m ago", not a date that would have to be right in every timezone.
function timeAgo(iso) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const minutes = Math.max(0, Math.round((Date.now() - at.getTime()) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// The header's notification bell — the account's own updates, read from the
// notifications endpoint the app's top nav already serves. It belongs to the
// signed-in user: with no session there is no bell at all, and no fetch is
// made for one. The panel borrows the view menu's shell (see raceSync.css),
// so both dropdowns on this header read as the same kind of thing.
function RaceSyncBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const wrapRef = useRef(null);
  const panelRef = useRef(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      // The endpoint answers with the rows themselves, newest first.
      const rows = await getNotifications();
      setItems(Array.isArray(rows) ? rows : []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  // The list loads with the signed-in user and is dropped with them — a bell
  // that outlived its session would be reading someone else's mail.
  useEffect(() => {
    if (user) load();
    else {
      setItems([]);
      setStatus('idle');
    }
  }, [user, load]);

  // Opening re-reads, so the panel is never stale — the app's own nav bell
  // does the same, and a notification that arrives while this page is open
  // still shows the moment the bell is used.
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) load();
  };

  // Dismiss on an outside click or Escape, and hand focus to the panel while
  // it is open — the view menu's own pattern, one control to the left.
  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.focus();
    const onPointerDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Reading a notification is what dismisses it: the row's own click marks it
  // read, first on screen (the panel is open, the reader is reading it) and
  // then on the server. If the server call fails the optimistic read stands —
  // the row was still read — and the next open puts the truth back.
  const markRead = (notification) => {
    if (notification.isRead) return;
    setItems((rows) =>
      rows.map((row) => (row.id === notification.id ? { ...row, isRead: true } : row))
    );
    markNotificationRead(notification.id).catch(() => {});
  };

  if (!user) return null;

  const unread = items.filter((item) => !item.isRead).length;
  const label = `Notifications${unread > 0 ? `, ${unread} unread` : ''}`;

  return (
    <div className="racesync-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="racesync-bell"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onClick={toggle}
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        {/* The app nav's live-pill dot, kept pale: a red dot would sink into
            the red bar. Only while something is unread. */}
        {unread > 0 && <span className="racesync-bell-dot" aria-hidden="true" />}
      </button>

      {open && (
        <div className="racesync-menu-panel racesync-bell-menu" ref={panelRef} tabIndex={-1}>
          <p className="racesync-bell-head">Updates</p>

          <ul className="racesync-bell-list">
            {status === 'loading' && (
              <li className="racesync-bell-note">Loading notifications…</li>
            )}
            {status === 'error' && (
              <li className="racesync-bell-note">Couldn’t load notifications right now.</li>
            )}
            {status === 'ready' && items.length === 0 && (
              <li className="racesync-bell-note">No notifications yet.</li>
            )}
            {status === 'ready' &&
              items.slice(0, 6).map((item) => {
                const body = (
                  <>
                    <span className="racesync-bell-title">{item.title ?? 'Notification'}</span>
                    {item.message && (
                      <span className="racesync-bell-message">{item.message}</span>
                    )}
                    {timeAgo(item.createdAt) && (
                      <span className="racesync-bell-time">{timeAgo(item.createdAt)}</span>
                    )}
                  </>
                );
                return (
                  <li
                    key={item.id}
                    className={`racesync-bell-item${item.isRead ? '' : ' is-unread'}`}
                  >
                    {/* A read row is text, not a control; an unread one is the
                        click that reads it — a link when the notification
                        carries somewhere to go, a button when all it carries
                        is itself. */}
                    {item.isRead ? (
                      <div className="racesync-bell-item-body">{body}</div>
                    ) : item.linkUrl ? (
                      <Link
                        className="racesync-bell-item-body"
                        to={item.linkUrl}
                        onClick={() => {
                          markRead(item);
                          setOpen(false);
                        }}
                      >
                        {body}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="racesync-bell-item-body"
                        onClick={() => markRead(item)}
                      >
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
          </ul>

          <Link
            className="racesync-bell-all"
            to="/profile"
            onClick={() => setOpen(false)}
          >
            View all in Profile
          </Link>
        </div>
      )}
    </div>
  );
}

export default RaceSyncBell;
