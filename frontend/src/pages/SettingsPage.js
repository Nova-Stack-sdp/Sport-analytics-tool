import { useState } from 'react';
import { useDeveloperMode } from '../context/DeveloperModeContext';

function SettingsPage() {
  const { isDeveloperMode, setDeveloperMode } = useDeveloperMode();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleToggle = async (event) => {
    const nextValue = event.target.checked;
    setIsSaving(true);
    setError('');
    try {
      await setDeveloperMode(nextValue);
    } catch {
      setError('Could not update developer mode. Try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page" id="page-settings">
      <div className="pagehead">
        <div className="section-eyebrow">Your account</div>
        <div className="section-title">Settings</div>
        <div className="section-desc">Preferences for how the site behaves for you.</div>
      </div>
      <div className="content">
        <div className="card">
          <div className="card-head">
            <div className="card-title">Developer mode</div>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">Submit derived stats</div>
              <div className="settings-row-desc">
                Turns on the Datasets and Submissions pages, where you can propose a new stat derived
                from race data for an admin to review.
              </div>
            </div>
            <label className="switch" aria-label="Toggle developer mode">
              <input
                type="checkbox"
                checked={isDeveloperMode}
                disabled={isSaving}
                onChange={handleToggle}
              />
              <span className="switch-track" />
            </label>
          </div>
          {error && (
            <p className="card-note" role="alert" style={{ color: 'var(--status-red)' }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;