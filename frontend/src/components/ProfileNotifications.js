import { useEffect, useState } from 'react';

function ProfileNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNotification, setSelectedNotification] = useState(null);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';
        const response = await fetch(`${API_URL}/api/notifications`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
        });

        if (!response.ok) {
          throw new Error('Failed to fetch notifications');
        }

        const data = await response.json();
        setNotifications(data);
      } catch (err) {
        console.error(err);
        setError('Could not load notifications.');
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, []);

  if (loading) return <div className="p-4">Loading notifications...</div>;
  if (error) return <div className="p-4 profile-message is-error">{error}</div>;

  return (
    <div className="profile-notifications-list">
      {notifications.length === 0 ? (
        <p style={{ padding: '1rem' }}>No notifications to display.</p>
      ) : (
        notifications.map((n) => (
          <button 
            key={n.id} 
            className={`notification-card ${n.isRead ? 'read' : 'unread'}`}
            onClick={() => setSelectedNotification(n)}
            style={{ 
              padding: '1rem', 
              border: '1px solid var(--border-soft, #ccc)',
              borderRadius: '8px',
              marginBottom: '0.75rem',
              opacity: n.isRead ? 0.7 : 1,
              width: '100%',
              textAlign: 'left',
              background: 'var(--surface, #fff)',
              cursor: 'pointer',
              display: 'block',
              transition: 'border-color 0.2s ease',
            }}
          >
            <h4 style={{ margin: '0 0 0.25rem 0' }}>{n.title}</h4>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>{n.message}</p>
            <small style={{ color: 'gray', fontSize: '0.8rem' }}>
              {new Date(n.createdAt).toLocaleString()}
            </small>
          </button>
        ))
      )}

      {selectedNotification && (
        <div className="modal-overlay" onMouseDown={() => setSelectedNotification(null)}>
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Notification details"
            onMouseDown={(e) => e.stopPropagation()}
            style={{ padding: '2rem', maxWidth: '400px', width: '100%' }}
          >
            <div className="modal-head" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>{selectedNotification.title}</h2>
              <button type="button" className="modal-close" onClick={() => setSelectedNotification(null)} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>
            <p style={{ marginBottom: '1.5rem' }}>{selectedNotification.message}</p>
            {selectedNotification.linkUrl && (
              <a 
                href={selectedNotification.linkUrl} 
                target="_blank" 
                rel="noreferrer"
                style={{ 
                  display: 'inline-block', 
                  padding: '0.5rem 1.25rem', 
                  background: 'var(--accent, #CE0D14)', 
                  color: 'var(--accent-contrast, #fff)', 
                  textDecoration: 'none', 
                  borderRadius: '9999px',
                  fontWeight: '600'
                }}
              >
                Read Article
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfileNotifications;