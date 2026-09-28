import { useEffect, useState } from 'react';

function ProfileNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        // Replace the fetch call with this:
        const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';
        const response = await fetch(`${API_URL}/api/notifications`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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
          <div 
            key={n.id} 
            className={`notification-card ${n.isRead ? 'read' : 'unread'}`}
            style={{ 
              padding: '1rem', 
              borderBottom: '1px solid var(--border-color, #eee)',
              opacity: n.isRead ? 0.7 : 1
            }}
          >
            <h4 style={{ margin: '0 0 0.25rem 0' }}>{n.title}</h4>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>{n.message}</p>
            <small style={{ color: 'gray', fontSize: '0.8rem' }}>
              {new Date(n.createdAt).toLocaleString()}
            </small>
          </div>
        ))
      )}
    </div>
  );
}

export default ProfileNotifications;