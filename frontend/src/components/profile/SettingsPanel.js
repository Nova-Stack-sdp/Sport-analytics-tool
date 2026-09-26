import { useState } from 'react';
import { useDeveloperMode } from '../../context/DeveloperModeContext';

// The Settings tab on the Profile page. This used to be its own /settings
// page; it now lives inside Profile so everything about "your account" is
// in one place (the old /settings URL redirects here — see AppRoutes).
function SettingsPanel() {
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
    <div className="settings-panel">
      <section className="card settings-card">
        <div className="card-head">
          <div>
            <div className="card-title">Developer mode</div>
            <div className="card-title-sub">Saved to your account, on every device.</div>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Submit derived stats</div>
            <div className="settings-row-desc">
              Turns on the Datasets and Submissions tools, where you can propose a new stat derived
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
      </section>
    </div>
  );
}

export default SettingsPanel;
