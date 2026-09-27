import { useMemo, useState } from 'react';
import { useDeveloperMode } from '../../context/DeveloperModeContext';
import { usePreferences } from '../../context/PreferencesContext';
import { REPLAY_SPEEDS, START_PAGES } from '../../services/preferences';
import { createDateTimeFormatters } from '../../utils/dateTime';

// The Settings tab on the Profile page. This used to be its own /settings
// page; it now lives inside Profile so everything about "your account" is
// in one place (the old /settings URL redirects here — see AppRoutes).
//
// Developer mode is saved to the account (backend). Everything else here is
// a site preference saved in this browser (see services/preferences.js).

function SettingRow({ label, description, htmlFor, children }) {
  return (
    <div className="settings-row">
      <div>
        {htmlFor
          ? <label className="settings-row-label" htmlFor={htmlFor}>{label}</label>
          : <div className="settings-row-label">{label}</div>}
        {description && <div className="settings-row-desc">{description}</div>}
      </div>
      <div className="settings-control">{children}</div>
    </div>
  );
}

// A row of radio buttons styled as one pill-shaped control.
function Segmented({ name, label, value, options, onChange }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label key={String(option.value)} className={`segmented-option${value === option.value ? ' is-selected' : ''}`}>
          <input
            type="radio"
            name={name}
            value={String(option.value)}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

function Switch({ label, checked, disabled, onChange }) {
  return (
    <label className="switch" aria-label={label}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
      <span className="switch-track" />
    </label>
  );
}

function SettingsCard({ title, subtitle, children }) {
  return (
    <section className="card settings-card">
      <div className="card-head">
        <div>
          <div className="card-title">{title}</div>
          {subtitle && <div className="card-title-sub">{subtitle}</div>}
        </div>
      </div>
      <div className="settings-rows">{children}</div>
    </section>
  );
}

// A fixed example moment, so the preview is stable and easy to compare.
const PREVIEW_MOMENT = '2026-07-05T14:05:00Z';

function SettingsPanel() {
  const { isDeveloperMode, setDeveloperMode } = useDeveloperMode();
  const { preferences, updatePreference, resetPreferences } = usePreferences();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveNote, setSaveNote] = useState(null); // { kind: 'ok' | 'error', text }

  const timePreview = useMemo(
    () => createDateTimeFormatters(preferences).formatDateTime(PREVIEW_MOMENT),
    [preferences]
  );

  const handleDeveloperToggle = async (event) => {
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

  const change = (key) => (value) => {
    const saved = updatePreference(key, value);
    setSaveNote(saved === false
      ? { kind: 'error', text: "This browser couldn't save that setting — it will apply until you close the tab." }
      : { kind: 'ok', text: 'Saved in this browser.' });
  };

  const handleReset = () => {
    resetPreferences();
    setSaveNote({ kind: 'ok', text: 'Site preferences reset to their defaults.' });
  };

  return (
    <div className="settings-panel">
      <SettingsCard title="Appearance" subtitle="How the site looks on this device.">
        <SettingRow label="Theme" description="Match system follows your device's light/dark setting.">
          <Segmented
            name="theme"
            label="Theme"
            value={preferences.theme}
            onChange={change('theme')}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'Match system' },
            ]}
          />
        </SettingRow>
        <SettingRow label="Density" description="Compact tightens spacing so more fits on screen — handy for big tables.">
          <Segmented
            name="density"
            label="Density"
            value={preferences.density}
            onChange={change('density')}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
          />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Motion" subtitle="For anyone who finds movement distracting.">
        <SettingRow
          label="Reduce motion"
          description="Turns off hover lifts, row flashes, fades and the blinking TelemetryTV badge. Race Replay's cars still move."
        >
          <Switch
            label="Toggle reduce motion"
            checked={preferences.reduceMotion}
            onChange={(event) => change('reduceMotion')(event.target.checked)}
          />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Race Replay" subtitle="What a replay starts with. You can still change both while watching.">
        <SettingRow label="Default speed" htmlFor="settings-replay-speed">
          <select
            id="settings-replay-speed"
            className="settings-select"
            value={String(preferences.replaySpeed)}
            onChange={(event) => change('replaySpeed')(Number(event.target.value))}
          >
            {REPLAY_SPEEDS.map((speed) => (
              <option key={speed} value={String(speed)}>{speed}×</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Show the safety car" description="Draw the safety car on track while it's deployed.">
          <Switch
            label="Toggle show safety car by default"
            checked={preferences.replayShowSafetyCar}
            onChange={(event) => change('replayShowSafetyCar')(event.target.checked)}
          />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Time & start page" subtitle={<>Example: <span className="mono">{timePreview}</span></>}>
        <SettingRow label="Clock">
          <Segmented
            name="clock"
            label="Clock"
            value={preferences.clock}
            onChange={change('clock')}
            options={[
              { value: 'auto', label: 'Browser default' },
              { value: '24h', label: '24-hour' },
              { value: '12h', label: '12-hour' },
            ]}
          />
        </SettingRow>
        <SettingRow label="Show times in" description="Race weekends span time zones — UTC keeps every session on one clock.">
          <Segmented
            name="timeZone"
            label="Show times in"
            value={preferences.timeZone}
            onChange={change('timeZone')}
            options={[
              { value: 'local', label: 'My local time' },
              { value: 'utc', label: 'UTC' },
            ]}
          />
        </SettingRow>
        <SettingRow label="Start page" description="Where you land after signing in." htmlFor="settings-start-page">
          <select
            id="settings-start-page"
            className="settings-select"
            value={preferences.startPage}
            onChange={(event) => change('startPage')(event.target.value)}
          >
            {START_PAGES.map((page) => (
              <option key={page.value} value={page.value}>{page.label}</option>
            ))}
          </select>
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Developer mode" subtitle="Saved to your account, on every device.">
        <SettingRow
          label="Submit derived stats"
          description="Turns on the Datasets and Submissions tools, where you can propose a new stat derived from race data for an admin to review."
        >
          <Switch
            label="Toggle developer mode"
            checked={isDeveloperMode}
            disabled={isSaving}
            onChange={handleDeveloperToggle}
          />
        </SettingRow>
        {error && (
          <p className="card-note" role="alert" style={{ color: 'var(--status-red)' }}>
            {error}
          </p>
        )}
      </SettingsCard>

      <div className="settings-footer">
        <p
          className={`settings-save-note${saveNote?.kind === 'error' ? ' is-error' : ''}`}
          role="status"
        >
          {saveNote?.text ?? 'Site preferences are saved in this browser.'}
        </p>
        <button type="button" className="btn btn-ghost" onClick={handleReset}>
          Reset site preferences
        </button>
      </div>
    </div>
  );
}

export default SettingsPanel;
