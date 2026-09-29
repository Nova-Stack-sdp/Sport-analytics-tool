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
    if (!user) {
      navigate('/sign-in');
      return;
    }
    if (busy) return;
    setBusy(true);
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
    } catch {
      // Leave the button as it was; the server rejected or was unreachable.
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
    >
      {following ? '✓ Following' : '+ Follow'}
    </button>
  );
}

export default FollowButton;