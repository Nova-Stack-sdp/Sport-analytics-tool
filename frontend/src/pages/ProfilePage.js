import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { clearSession } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useDeveloperMode } from '../context/DeveloperModeContext';
import SettingsPanel from '../components/profile/SettingsPanel';
import {
  profileImageToDataUrl,
  readLocalProfile,
  saveLocalProfile,
  validateProfileImage,
} from '../services/userProfile';

// Each tab has a URL slug so other pages can link straight to one, e.g.
// /profile?tab=settings (the old /settings route redirects there).
const PROFILE_TABS = [
  { slug: 'profile', label: 'User Profile' },
  { slug: 'settings', label: 'Settings' },
  { slug: 'news', label: 'News Feed' },
  { slug: 'calendar', label: 'Calendar' },
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
  const [displayName, setDisplayName] = useState(initialProfile.displayName);
  const [photoDataUrl, setPhotoDataUrl] = useState(initialProfile.photoDataUrl);
  const [selectedPhotoName, setSelectedPhotoName] = useState('');
  const [saveState, setSaveState] = useState('idle');
  const [message, setMessage] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = tabFromParam(searchParams.get('tab'));

  const selectTab = (slug) => {
    // replace, not push: flicking between tabs shouldn't fill up the back
    // button history.
    setSearchParams(slug === DEFAULT_TAB ? {} : { tab: slug }, { replace: true });
  };

  useEffect(() => {
    const savedProfile = readLocalProfile(user);
    setDisplayName(savedProfile.displayName);
    setPhotoDataUrl(savedProfile.photoDataUrl);
  }, [user]);

  const initials = useMemo(
    () => initialsFor(displayName || user?.displayName, user?.email),
    [displayName, user?.displayName, user?.email]
  );

  const clearStatus = () => {
    if (saveState !== 'idle') setSaveState('idle');
    if (message) setMessage('');
  };

  const handleSave = (event) => {
    event.preventDefault();
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
      setDisplayName(nextName);
      setSelectedPhotoName('');
      setSaveState('success');
      setMessage('Your profile has been saved in this browser.');
    } catch {
      setSaveState('error');
      setMessage('This browser could not save your profile. Try a smaller picture.');
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
        <div className="section-desc">Manage how your account appears and how the site behaves for you.</div>
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
          <button
            type="button"
            className="btn btn-ghost profile-settings-link"
            onClick={() => selectTab('settings')}
          >
            Account settings
          </button>
        </section>

        <div className="profile-grid">
          <section className="card profile-card">
            <div className="card-head">
              <div>
                <div className="card-title">Personal details</div>
                <div className="card-title-sub">Saved on this browser and device.</div>
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
          <Link to="/watch-live" className="profile-action-card">
            <span className="profile-action-index">01</span>
            <strong>Watch Live</strong>
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
      </div>
    </div>
  );
}

export default ProfilePage;
