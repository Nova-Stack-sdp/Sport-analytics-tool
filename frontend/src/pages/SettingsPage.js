import { useDeveloperMode } from '../context/DeveloperModeContext';

function SettingsPage() {
  const { isDeveloperMode, setDeveloperMode } = useDeveloperMode();

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
                onChange={(event) => setDeveloperMode(event.target.checked)}
              />
              <span className="switch-track" />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;