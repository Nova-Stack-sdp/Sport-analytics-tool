import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  followDriver,
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

  const checkFollowing = () => {
    if (!user?.uid || !entity?.id) return false;
    return type === 'team'
      ? isFollowingTeam(user.uid, entity.id)
      : isFollowingDriver(user.uid, entity.id);
  };

  useEffect(() => {
    setFollowing(checkFollowing());
    return subscribeToFollows(user?.uid, () => setFollowing(checkFollowing()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, entity?.id, type]);

  const handleClick = () => {
    if (!user) {
      navigate('/sign-in');
      return;
    }
    if (following) {
      if (type === 'team') unfollowTeam(user.uid, entity.id);
      else unfollowDriver(user.uid, entity.id);
    } else if (type === 'team') {
      followTeam(user.uid, entity);
    } else {
      followDriver(user.uid, entity);
    }
    setFollowing(!following);
  };

  return (
    <button
      type="button"
      className={`follow-btn${following ? ' is-following' : ''} ${className}`.trim()}
      onClick={handleClick}
      aria-pressed={following}
    >
      {following ? '✓ Following' : '+ Follow'}
    </button>
  );
}

export default FollowButton;
