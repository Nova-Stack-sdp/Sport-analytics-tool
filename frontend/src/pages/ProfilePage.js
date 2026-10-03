import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { clearSession, getDrivers, getTeams } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useDeveloperMode } from '../context/DeveloperModeContext';
import NewsFeedPanel from '../components/profile/NewsFeedPanel';
import SettingsPanel from '../components/profile/SettingsPanel';
import {
  profileImageToDataUrl,
  readLocalProfile,
  saveLocalProfile,
  validateProfileImage,
} from '../services/userProfile';
import { loadFollows, readFollows, subscribeToFollows, unfollowDriver, unfollowTeam } from '../services/followService';
import FollowingListModal from '../components/FollowingListModal';
import ProfileCalendar from '../components/ProfileCalendar';
import ProfileNotifications from '../components/ProfileNotifications';
import {
  loadUserPreferences,
  readCachedUserPreferences,
  saveUserPreferences,
  subscribeToUserPreferences,
} from '../services/userPreferences';
import {
  OFFICIAL_2026_DRIVERS,
  OFFICIAL_2026_TEAMS,
  preferenceCatalog,
} from '../services/f1Catalog';

// Each tab has a URL slug so other pages can link straight to one
const PROFILE_TABS = [
  { slug: 'profile', label: 'User Profile' },
  { slug: 'settings', label: 'Settings' },
  { slug: 'news', label: 'News Feed' },
  { slug: 'calendar', label: 'Calendar' },
  { slug: 'notifications', label: 'Notifications' } // Added your Notifications tab here
];
const DEFAULT_TAB = PROFILE_TABS[0].slug;

function tabFromParam(value) {
  return PROFILE_TABS.some((tab) => tab.slug === value) ? value : DEFAULT_TAB;
}

function initialsFor(name, email) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return (parts[0]?.[0] || email?.[0] || '?').toUpperCase();
}

function friendlyDate(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function providerLabel(user) {
  const providerId = user?.providerData?.[0]?.providerId;
  if (providerId === 'google.com') return 'Google';
  if (providerId === 'password') return 'Email and password';
  return providerId ? providerId.replace('.com', '') : 'Email account';
}

function ProfilePage() {
  const navigate = useNavigate();
  const { user, isAdmin, signOut: clearAuth } = useAuth();
  const { isDeveloperMode } = useDeveloperMode();
  const initialProfile = readLocalProfile(user);
  const initialPreferences = readCachedUserPreferences(user);
  const [displayName, setDisplayName] = useState(initialProfile.displayName);
  const [photoDataUrl, setPhotoDataUrl] = useState(initialProfile.photoDataUrl);
  const [selectedPhotoName, setSelectedPhotoName] = useState('');
  const [saveState, setSaveState] = useState('idle');
  const [message, setMessage] = useState('');
// State from main branch (Preferences & URL Params)
  const [preferences, setPreferences] = useState(initialPreferences);
  const [catalog, setCatalog] = useState({
    drivers: OFFICIAL_2026_DRIVERS,
    teams: OFFICIAL_2026_TEAMS,
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = tabFromParam(searchParams.get('tab'));

  const selectTab = (slug) => {
    // replace, not push: flicking between tabs shouldn't fill up the back button history.
    setSearchParams(slug === DEFAULT_TAB ? {} : { tab: slug }, { replace: true });
  };

  // State from your branch (Follows & Notifications)
  const [follows, setFollows] = useState(() => readFollows(user?.uid));
  const [followModalOpen, setFollowModalOpen] = useState(false);

  useEffect(() => {
    if (!user?.uid) return undefined;
    let active = true;
    setFollows(readFollows(user.uid));
    const unsubscribe = subscribeToFollows(user.uid, () => active && setFollows(readFollows(user.uid)));
    loadFollows(user.uid)
      .then((loaded) => active && setFollows(loaded))
      .catch(() => {});
    return () => {
      active = false;
      unsubscribe();
    };
  }, [user?.uid]);

  const followCount = follows.drivers.length + follows.teams.length;

  useEffect(() => {
    const savedProfile = readLocalProfile(user);
    setDisplayName(savedProfile.displayName);
    setPhotoDataUrl(savedProfile.photoDataUrl);

    let cancelled = false;
    const cached = readCachedUserPreferences(user);
    setPreferences(cached);
    const unsubscribe = subscribeToUserPreferences(user?.uid, () => {
      if (cancelled) return;
      setPreferences((current) => ({
        ...current,
        ...readCachedUserPreferences(user),
      }));
    });

    loadUserPreferences(user).then((loaded) => {
      if (cancelled) return;
      setPreferences(loaded);
      if (loaded.displayName) setDisplayName(loaded.displayName);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([
      getDrivers({ limit: 100, offset: 0 }),
      getTeams({ limit: 100, offset: 0 }),
    ]).then(([driversResult, teamsResult]) => {
      if (cancelled) return;
      const liveDrivers = driversResult.status === 'fulfilled' ? driversResult.value.drivers || [] : [];
      const liveTeams = teamsResult.status === 'fulfilled' ? teamsResult.value.teams || [] : [];
      const drivers = preferenceCatalog(liveDrivers, OFFICIAL_2026_DRIVERS, 'driver');
      const teams = preferenceCatalog(liveTeams, OFFICIAL_2026_TEAMS, 'team');
      setCatalog({ drivers, teams });
    });

    return () => { cancelled = true; };
  }, []);

  const initials = useMemo(
    () => initialsFor(displayName || user?.displayName, user?.email),
    [displayName, user?.displayName, user?.email]
  );

  const clearStatus = () => {
    if (saveState !== 'idle') setSaveState('idle');
    if (message) setMessage('');
  };

  const handleSave = async (event) => {
    event?.preventDefault();
    const nextName = displayName.trim();
    if (!nextName) {
      setSaveState('error');
      setMessage('Please enter the name you want shown on your profile.');
      return;
    }

    setSaveState('saving');
    setMessage('');
    try {
      saveLocalProfile(user, {
        displayName: nextName,
        photoDataUrl,
      });
    } catch {
      setSaveState('error');
      setMessage('This browser could not save your profile. Try a smaller picture.');
      return;
    }

    try {
      const savedPreferences = await saveUserPreferences(user, {
        ...preferences,
        displayName: nextName,
      });
      setDisplayName(nextName);
      setPreferences(savedPreferences);
      setSelectedPhotoName('');
      setSaveState('success');
      setMessage(savedPreferences.storage === 'cloud'
        ? 'Your profile has been saved to your account.'
        : 'Your demo profile has been saved in this browser.');
    } catch {
      setDisplayName(nextName);
      setPreferences((current) => ({
        ...current,
        displayName: nextName,
        storage: 'browser',
      }));
      setSelectedPhotoName('');
      setSaveState('warning');
      setMessage('Your profile was saved in this browser, but Firestore could not sync it.');
    }
  };

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validationError = validateProfileImage(file);
    if (validationError) {
      setSaveState('error');
      setMessage(validationError);
      event.target.value = '';
      return;
    }

    try {
      setPhotoDataUrl(await profileImageToDataUrl(file));
      setSelectedPhotoName(file.name);
      setSaveState('idle');
      setMessage('');
    } catch (error) {
      setSaveState('error');
      setMessage(error.message);
    }
  };

  const handleSignOut = async () => {
    clearAuth();
    await Promise.all([signOut(auth), clearSession()]);
    navigate('/', { replace: true });
  };

  return (
    <div className="page profile-page" id="page-profile">
      <div className="pagehead profile-pagehead">
        <div className="section-eyebrow">Your account</div>
        <div className="section-title">Profile</div>
        <div className="section-desc">Manage your account, site preferences, and the Formula 1 news you follow.</div>
      </div>

      <div className="content profile-content">
        <div className="tabs profile-tabs" role="tablist" aria-label="User dashboard sections">
          {PROFILE_TABS.map((tab) => (
            <button
              key={tab.slug}
              className={`tab${activeTab === tab.slug ? ' active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.slug}
              onClick={() => selectTab(tab.slug)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'settings' && <SettingsPanel />}

        {activeTab === 'profile' && (
          <>
        <section className="profile-hero" aria-labelledby="profile-name">
          <div className="profile-avatar-wrap">
            <div className="profile-avatar">
              {photoDataUrl ? <img src={photoDataUrl} alt="Your profile" /> : initials}
            </div>
            <label className="profile-photo-button" htmlFor="profile-photo">Change photo</label>
            <input
              className="profile-photo-input"
              id="profile-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoChange}
              disabled={saveState === 'saving'}
            />
          </div>
          <div className="profile-identity">
            <div className="profile-overline">F1 Analytics member</div>
            <h1 id="profile-name">{displayName || user?.displayName || 'F1 fan'}</h1>
            <p>{user?.email || 'Email unavailable'}</p>
            <div className="profile-badges">
              <span className={`profile-badge ${user?.emailVerified ? 'is-verified' : ''}`}>
                {user?.emailVerified ? 'Verified account' : 'Signed-in account'}
              </span>
              <span className={`profile-badge ${isDeveloperMode ? 'is-developer' : ''}`}>
                {isDeveloperMode ? 'Developer mode on' : 'Standard access'}
              </span>
            </div>
          </div>
          <button type="button" className="btn btn-ghost profile-following-btn" onClick={() => setFollowModalOpen(true)}>
            Following <span className="profile-following-count">{followCount}</span>
          </button>
          <button
            type="button"
            className="btn btn-ghost profile-settings-link"
            onClick={() => selectTab('settings')}
          >
            Account settings
          </button>
        </section>

        {followModalOpen && (
          <FollowingListModal
            drivers={follows.drivers}
            teams={follows.teams}
            onUnfollowDriver={(driverId) => unfollowDriver(user.uid, driverId).then(setFollows).catch(() => {})}
            onUnfollowTeam={(teamId) => unfollowTeam(user.uid, teamId).then(setFollows).catch(() => {})}
            onClose={() => setFollowModalOpen(false)}
          />
        )}

        <div className="profile-grid">
          <section className="card profile-card">
            <div className="card-head">
              <div>
                <div className="card-title">Personal details</div>
                <div className="card-title-sub">Synced to your account; profile pictures remain on this browser.</div>
              </div>
            </div>

            <form className="profile-form" onSubmit={handleSave}>
              <label htmlFor="profile-display-name">Display name</label>
              <input
                id="profile-display-name"
                type="text"
                autoComplete="name"
                value={displayName}
                disabled={saveState === 'saving'}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  clearStatus();
                }}
              />

              <label htmlFor="profile-email">Email address</label>
              <input id="profile-email" type="email" value={user?.email || ''} disabled readOnly />
              <div className="profile-field-note">Your email is managed by your sign-in provider.</div>

              {selectedPhotoName && (
                <div className="profile-field-note">New picture selected: {selectedPhotoName}</div>
              )}

              {message && (
                <p
                  className={`profile-message ${saveState === 'error' ? 'is-error' : 'is-success'}`}
                  role={saveState === 'error' ? 'alert' : 'status'}
                >
                  {message}
                </p>
              )}

              <button className="btn btn-primary profile-save" type="submit" disabled={saveState === 'saving'}>
                {saveState === 'saving' ? 'Saving…' : 'Save profile'}
              </button>
            </form>
          </section>

          <section className="card profile-card">
            <div className="card-head">
              <div>
                <div className="card-title">Account details</div>
                <div className="card-title-sub">Information connected to your sign-in.</div>
              </div>
            </div>
            <dl className="profile-detail-list">
              <div><dt>Member since</dt><dd>{friendlyDate(user?.metadata?.creationTime)}</dd></div>
              <div><dt>Sign-in method</dt><dd>{providerLabel(user)}</dd></div>
              <div><dt>Account access</dt><dd>{[isAdmin && 'Admin', isDeveloperMode ? 'Developer' : 'Standard'].filter(Boolean).join(' · ')}</dd></div>
              <div><dt>User ID</dt><dd className="profile-user-id">{user?.uid || 'Not available'}</dd></div>
            </dl>
          </section>
        </div>

        <section className="profile-actions" aria-label="Account shortcuts">
          <Link to="/telemetry-tv" className="profile-action-card">
            <span className="profile-action-index">01</span>
            <strong>Telemetry TV</strong>
            <span>Follow the race with synchronized analytics.</span>
            <b aria-hidden="true">→</b>
          </Link>
          <Link to="/profile?tab=settings" className="profile-action-card">
            <span className="profile-action-index">02</span>
            <strong>Settings</strong>
            <span>Manage developer mode and your site preferences.</span>
            <b aria-hidden="true">→</b>
          </Link>
          <Link to="/developer" className="profile-action-card">
            <span className="profile-action-index">03</span>
            <strong>Developer tools</strong>
            <span>Explore data access and contribution tools.</span>
            <b aria-hidden="true">→</b>
          </Link>
        </section>

        <section className="card profile-signout-card">
          <div>
            <div className="card-title">Finished for now?</div>
            <div className="settings-row-desc">Sign out safely on this device.</div>
          </div>
          <button className="btn btn-ghost" type="button" onClick={handleSignOut}>Sign out</button>
        </section>
          </>
        )}
{activeTab === 'news' && (
          <NewsFeedPanel preferences={preferences} catalog={catalog} />
        )}

        {activeTab === 'calendar' && (
          <section className="card profile-card profile-calendar-card">
            <div className="card-head">
              <div>
                <div className="card-title">Season calendar</div>
                <div className="card-title-sub">Every tracked race weekend this season.</div>
              </div>
            </div>
            <ProfileCalendar follows={follows} />
          </section>
        )}

        {/* --- NOTIFICATIONS NEW SECTION --- */}
        {activeTab === 'notifications' && (
          <section className="card profile-card">
            <div className="card-head">
              <div>
                <div className="card-title">Notifications</div>
                <div className="card-title-sub">Recent updates, alerts, and race news.</div>
              </div>
            </div>
            <ProfileNotifications />
          </section>
        )}
      </div>
    </div>
  );
}

export default ProfilePage;
