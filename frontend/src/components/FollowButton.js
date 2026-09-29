import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  followDriver,
  loadFollows,
  followTeam,
  isFollowingDriver,
  isFollowingTeam,
  subscribeToFollows,
  unfollowDriver,
  unfollowTeam,
} from '../services/followService';

// `type` is 'driver' or 'team'; `entity` is the small snapshot stored
// alongside the follow (id, name, plus whatever the Following list should
// show — number/teamName/teamColor for a driver, color/logoUrl for a team).
function FollowButton({ type, entity, className = '' }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const checkFollowing = () => {
    if (!user?.uid || !entity?.id) return false;
    return type === 'team'
      ? isFollowingTeam(user.uid, entity.id)
      : isFollowingDriver(user.uid, entity.id);
  };

  useEffect(() => {
    if (!user?.uid) {
      setFollowing(false);
      return undefined;
    }
    let active = true;
    setFollowing(checkFollowing());
    const unsubscribe = subscribeToFollows(user.uid, () => active && setFollowing(checkFollowing()));
    loadFollows(user.uid)
      .then(() => active && setFollowing(checkFollowing()))
      .catch(() => {});
    return () => {
      active = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, entity?.id, type]);

  const handleClick = async () => {
    console.log('[FollowButton] clicked', { type, id: entity?.id, signedIn: !!user, busy });
    if (!user) {
      navigate('/sign-in');
      return;
    }
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (following) {
        if (type === 'team') await unfollowTeam(user.uid, entity.id);
        else await unfollowDriver(user.uid, entity.id);
      } else if (type === 'team') {
        await followTeam(user.uid, entity);
      } else {
        await followDriver(user.uid, entity);
      }
      setFollowing(checkFollowing());
    } catch (err) {
      // Leave the button as it was, but say why instead of failing silently.
      console.error('Follow request failed:', err.status, err.body || err.message);
      setError(err.body?.error || err.message || 'Could not update follow');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`follow-btn${following ? ' is-following' : ''} ${className}`.trim()}
      onClick={handleClick}
      aria-pressed={following}
      disabled={busy}
      title={error || undefined}
    >
      {error ? '⚠ Retry follow' : following ? '✓ Following' : '+ Follow'}
    </button>
  );
}

export default FollowButton;