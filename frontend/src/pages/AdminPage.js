import { useState } from 'react';

const ADMIN_TABS = ['Submitters', 'API Keys', 'Dataset Releases', 'API Versions', 'Reconciliation'];

// ── Mock data ────────────────────────────────────────────────────────────────

const SUBMITTERS = [
  { id: 'usr_8f2a', name: 'Marcus Chen', handle: 'analyst_042', role: 'Senior Submitter', scope: 'Full season · all sessions', status: 'active', submissions: 184, lastActive: '2 hrs ago' },
  { id: 'usr_3c71', name: 'Priya Nair', handle: 'official_017', role: 'Official Data Partner', scope: 'Race & Qualifying only', status: 'active', submissions: 92, lastActive: '14 min ago' },
  { id: 'usr_ae09', name: 'Tomás Ferreira', handle: 'analyst_019', role: 'Junior Submitter', scope: 'FP sessions only', status: 'suspended', submissions: 31, lastActive: '8 days ago' },
  { id: 'usr_d44b', name: 'Lena Kowalski', handle: 'analyst_088', role: 'Senior Submitter', scope: 'Full season · all sessions', status: 'pending', submissions: 0, lastActive: '—' },
  { id: 'usr_10f6', name: 'Ravi Anand', handle: 'telemetry_r01', role: 'Telemetry Partner', scope: 'Pit & tyre data only', status: 'active', submissions: 217, lastActive: '1 hr ago' },
];

const API_KEYS = [
  { id: 'key_9a1f', consumer: 'SportTech Analytics', key: 'dev_7f8c…ab92', tier: 'Pro', quota: '1,000 / min', usage: 74, issued: 'Jan 12, 2026', status: 'active' },
  { id: 'key_44be', consumer: 'F1Stats.io', key: 'dev_3e01…cd47', tier: 'Enterprise', quota: '5,000 / min', usage: 41, issued: 'Mar 04, 2026', status: 'active' },
  { id: 'key_7c22', consumer: 'PitLab Research', key: 'dev_8b44…ef10', tier: 'Basic', quota: '200 / min', usage: 92, issued: 'Nov 20, 2025', status: 'active' },
  { id: 'key_d803', consumer: 'RaceCast AI', key: 'dev_11aa…7730', tier: 'Pro', quota: '1,000 / min', usage: 0, issued: 'Jun 01, 2026', status: 'revoked' },
];

const DATASET_RELEASES = [
  { version: 'v2026.10.20', schema: 'v3.2', fixtures: 312, size: '1.8 GB', checksum: 'a92f…c1d8', status: 'published', date: 'Oct 20, 2026' },
  { version: 'v2026.10.18', schema: 'v3.2', fixtures: 311, size: '1.8 GB', checksum: '7e1d…9a44', status: 'published', date: 'Oct 18, 2026' },
  { version: 'v2026.10.15', schema: 'v3.1', fixtures: 309, size: '1.7 GB', checksum: 'b3c2…6f0e', status: 'deprecated', date: 'Oct 15, 2026' },
  { version: 'v2026.10.10-rc1', schema: 'v3.3-rc', fixtures: 312, size: '1.9 GB', checksum: 'f08a…22b1', status: 'draft', date: 'Oct 10, 2026' },
];

const API_VERSIONS = [
  { version: 'v3', status: 'current', endpoints: 12, consumers: 48, released: 'Feb 01, 2026', deprecation: '—' },
  { version: 'v2', status: 'deprecated', endpoints: 9, consumers: 14, released: 'Aug 15, 2024', deprecation: 'Dec 31, 2026' },
  { version: 'v1', status: 'retired', endpoints: 6, consumers: 0, released: 'Jan 10, 2023', deprecation: 'Jun 30, 2025' },
];

const RECONCILIATIONS = [
  { id: 'rec_4f81', fixture: 'Mexico City GP 2026', event: 'event_00984', field: 'flag_type', submitterA: 'official_017', valueA: 'SAFETY_CAR', submitterB: 'analyst_042', valueB: 'VIRTUAL_SAFETY_CAR', status: 'resolved', resolvedBy: 'admin_01', resolution: 'VIRTUAL_SAFETY_CAR', propagated: true },
  { id: 'rec_a220', fixture: 'Singapore GP 2026', event: 'event_04521', field: 'pit_duration_ms', submitterA: 'telemetry_r01', valueA: '23400', submitterB: 'official_017', valueB: '24100', status: 'open', resolvedBy: '—', resolution: '—', propagated: false },
  { id: 'rec_71bc', fixture: 'Monza GP 2026', event: 'event_07733', field: 'final_position', submitterA: 'analyst_042', valueA: '3', submitterB: 'official_017', valueB: '4', status: 'open', resolvedBy: '—', resolution: '—', propagated: false },
  { id: 'rec_e55d', fixture: 'Suzuka GP 2026', event: 'event_01204', field: 'lap_time_ms', submitterA: 'analyst_042', valueA: '91234', submitterB: 'telemetry_r01', valueB: '91287', status: 'resolved', resolvedBy: 'admin_03', resolution: '91287 (telemetry source preferred)', propagated: true },
];

// ── Sub-components ───────────────────────────────────────────────────────────

function SubmittersTab() {
  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="stat-mini"><div className="l">Total submitters</div><div className="v">{SUBMITTERS.length}</div></div>
        <div className="stat-mini"><div className="l">Active</div><div className="v ok">{SUBMITTERS.filter(s => s.status === 'active').length}</div></div>
        <div className="stat-mini"><div className="l">Pending approval</div><div className="v warn">{SUBMITTERS.filter(s => s.status === 'pending').length}</div></div>
        <div className="stat-mini"><div className="l">Suspended</div><div className="v accent">{SUBMITTERS.filter(s => s.status === 'suspended').length}</div></div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Submitter accounts</div>
            <div className="card-title-sub">Approve, scope, and revoke data submitters</div>
          </div>
          <button className="btn btn-primary btn-sm">+ Invite submitter</button>
        </div>
        <table>
          <tbody>
            <tr><th>Name</th><th>Handle</th><th>Role</th><th>Scope</th><th>Submissions</th><th>Status</th><th></th></tr>
            {SUBMITTERS.map((s) => (
              <tr key={s.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{s.name}</div>
                  <div className="secondary" style={{ fontSize: 11 }}>{s.id}</div>
                </td>
                <td className="mono secondary">{s.handle}</td>
                <td>{s.role}</td>
                <td className="secondary">{s.scope}</td>
                <td className="mono">{s.submissions}</td>
                <td>
                  {s.status === 'active' && <span className="pill pill-green">Active</span>}
                  {s.status === 'pending' && <span className="pill pill-amber">Pending</span>}
                  {s.status === 'suspended' && <span className="pill pill-red">Suspended</span>}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {s.status === 'pending' && <button className="btn btn-primary btn-sm">Approve</button>}
                    {s.status === 'active' && <button className="btn btn-ghost btn-sm">Suspend</button>}
                    {s.status === 'suspended' && <button className="btn btn-ghost btn-sm">Reactivate</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="card-note">Scope defines which sessions and event types a submitter is authorized to contribute. Out-of-scope submissions are rejected at the staging step.</div>
      </div>
    </>
  );
}

function ApiKeysTab() {
  return (
    <>
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="stat-mini"><div className="l">Active keys</div><div className="v ok">{API_KEYS.filter(k => k.status === 'active').length}</div></div>
        <div className="stat-mini"><div className="l">Revoked keys</div><div className="v accent">{API_KEYS.filter(k => k.status === 'revoked').length}</div></div>
        <div className="stat-mini"><div className="l">Total API calls (24h)</div><div className="v">184,203</div></div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">API keys &amp; quotas</div>
            <div className="card-title-sub">Issue, rotate, and revoke consumer API keys</div>
          </div>
          <button className="btn btn-primary btn-sm">+ Issue new key</button>
        </div>
        <table>
          <tbody>
            <tr><th>Consumer</th><th>Key</th><th>Tier</th><th>Quota</th><th>Bucket usage</th><th>Status</th><th></th></tr>
            {API_KEYS.map((k) => (
              <tr key={k.id}>
                <td style={{ fontWeight: 600 }}>{k.consumer}</td>
                <td className="mono">{k.key}</td>
                <td><span className="pill pill-gray">{k.tier}</span></td>
                <td className="mono">{k.quota}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="mini-progress"><div style={{ width: `${k.usage}%`, background: k.usage > 85 ? 'var(--status-red)' : undefined }}></div></div>
                    <span className="mono secondary" style={{ fontSize: 11 }}>{k.usage}%</span>
                  </div>
                </td>
                <td>
                  {k.status === 'active' && <span className="pill pill-green">Active</span>}
                  {k.status === 'revoked' && <span className="pill pill-red">Revoked</span>}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {k.status === 'active' && <><button className="btn btn-ghost btn-sm">Rotate</button><button className="btn btn-ghost btn-sm" style={{ color: 'var(--status-red)' }}>Revoke</button></>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="card-note">Quotas are enforced per-minute via a sliding window. Keys exceeding 85% bucket usage are highlighted for review. Rotated keys are invalidated immediately with a 60-second grace period.</div>
      </div>
    </>
  );
}

function DatasetReleasesTab() {
  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="stat-mini"><div className="l">Published releases</div><div className="v">{DATASET_RELEASES.filter(d => d.status === 'published').length}</div></div>
        <div className="stat-mini"><div className="l">Drafts</div><div className="v warn">{DATASET_RELEASES.filter(d => d.status === 'draft').length}</div></div>
        <div className="stat-mini"><div className="l">Deprecated</div><div className="v accent">{DATASET_RELEASES.filter(d => d.status === 'deprecated').length}</div></div>
        <div className="stat-mini"><div className="l">Current schema</div><div className="v">v3.2</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <div className="card-title">Release management</div>
            <div className="card-title-sub">Version, publish, and deprecate dataset snapshots</div>
          </div>
          <button className="btn btn-primary btn-sm">+ Create release</button>
        </div>
        <table>
          <tbody>
            <tr><th>Version</th><th>Schema</th><th>Fixtures</th><th>Size</th><th>Checksum (SHA-256)</th><th>Status</th><th></th></tr>
            {DATASET_RELEASES.map((d) => (
              <tr key={d.version}>
                <td>
                  <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{d.version}</div>
                  <div className="secondary" style={{ fontSize: 11 }}>{d.date}</div>
                </td>
                <td className="mono">{d.schema}</td>
                <td className="mono secondary">{d.fixtures}</td>
                <td className="mono secondary">{d.size}</td>
                <td className="mono secondary">{d.checksum}</td>
                <td>
                  {d.status === 'published' && <span className="pill pill-green">Published</span>}
                  {d.status === 'draft' && <span className="pill pill-amber">Draft</span>}
                  {d.status === 'deprecated' && <span className="pill pill-gray">Deprecated</span>}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {d.status === 'draft' && <button className="btn btn-primary btn-sm">Publish</button>}
                    {d.status === 'published' && <button className="btn btn-ghost btn-sm">Deprecate</button>}
                    {d.status === 'published' && <button className="btn btn-ghost btn-sm">Schema docs</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="card-note">Every release is an immutable snapshot tagged with a SHA-256 checksum. Consumers can verify download integrity by comparing the checksum. Deprecated releases remain downloadable but are excluded from the change feed.</div>
      </div>

      <div className="card">
        <div className="card-head"><div className="card-title">Schema documentation</div><span className="card-title-sub">Current: v3.2</span></div>
        <div className="kv"><span>Event types supported</span><b>9</b></div>
        <div className="kv"><span>Projection tables</span><b>4 (driver_session_stats, driver_career_stats, team_season_stats, head_to_head)</b></div>
        <div className="kv"><span>Last schema migration</span><b>add_openf1_keys (Aug 15, 2026)</b></div>
        <div className="kv"><span>Breaking changes since v3.0</span><b>0</b></div>
        <button className="btn btn-ghost btn-full" style={{ marginTop: 14 }}>View full schema reference</button>
      </div>
    </>
  );
}

function ApiVersionsTab() {
  return (
    <>
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="stat-mini"><div className="l">Current version</div><div className="v ok">v3</div></div>
        <div className="stat-mini"><div className="l">Deprecated (sunset pending)</div><div className="v warn">v2</div></div>
        <div className="stat-mini"><div className="l">Retired</div><div className="v">v1</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <div className="card-title">Version lifecycle</div>
            <div className="card-title-sub">Track adoption, plan deprecation, communicate sunset dates</div>
          </div>
          <button className="btn btn-primary btn-sm">+ Draft new version</button>
        </div>
        <table>
          <tbody>
            <tr><th>Version</th><th>Status</th><th>Endpoints</th><th>Active consumers</th><th>Released</th><th>Deprecation date</th><th></th></tr>
            {API_VERSIONS.map((v) => (
              <tr key={v.version}>
                <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 13 }}>{v.version}</td>
                <td>
                  {v.status === 'current' && <span className="pill pill-green">Current</span>}
                  {v.status === 'deprecated' && <span className="pill pill-amber">Deprecated</span>}
                  {v.status === 'retired' && <span className="pill pill-gray">Retired</span>}
                </td>
                <td className="mono">{v.endpoints}</td>
                <td className="mono">{v.consumers}</td>
                <td className="secondary">{v.released}</td>
                <td className="mono secondary">{v.deprecation}</td>
                <td>
                  {v.status === 'deprecated' && <button className="btn btn-ghost btn-sm">Notify consumers</button>}
                  {v.status === 'current' && <button className="btn btn-ghost btn-sm">View changelog</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-head"><div className="card-title">Deprecation policy</div></div>
          <div className="kv"><span>Minimum notice period</span><b>90 days</b></div>
          <div className="kv"><span>Communication channels</span><b>Email + API response header</b></div>
          <div className="kv"><span>Sunset header</span><b className="mono">Sunset: Sat, 31 Dec 2026 23:59:59 GMT</b></div>
          <div className="kv"><span>Migration guide published</span><b><span className="pill pill-green">Yes</span></b></div>
          <div className="card-note">Deprecated versions return a <span className="mono">Sunset</span> HTTP header on every response. Consumers still on v2 will receive email reminders at 60, 30, and 7 days before retirement.</div>
        </div>

        <div className="card">
          <div className="card-head"><div className="card-title">v2 → v3 migration progress</div></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}><span>Consumers migrated</span><span>34 / 48</span></div>
          <div className="progress-bar"><div className="progress-fill" style={{ width: '71%' }}></div></div>
          <div style={{ marginTop: 14 }}>
            <div className="kv"><span>Remaining on v2</span><b>14 consumers</b></div>
            <div className="kv"><span>Top holdout</span><b className="mono">PitLab Research (key_7c22…)</b></div>
            <div className="kv"><span>Days until sunset</span><b>134</b></div>
          </div>
          <button className="btn btn-ghost btn-full" style={{ marginTop: 14 }}>Send migration reminder</button>
        </div>
      </div>
    </>
  );
}

function ReconciliationTab() {
  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="stat-mini"><div className="l">Open disputes</div><div className="v warn">{RECONCILIATIONS.filter(r => r.status === 'open').length}</div></div>
        <div className="stat-mini"><div className="l">Resolved</div><div className="v ok">{RECONCILIATIONS.filter(r => r.status === 'resolved').length}</div></div>
        <div className="stat-mini"><div className="l">Corrections propagated</div><div className="v">{RECONCILIATIONS.filter(r => r.propagated).length}</div></div>
        <div className="stat-mini"><div className="l">Avg resolution time</div><div className="v">4.2h</div></div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Submitter disagreements &amp; corrections</div>
            <div className="card-title-sub">Reconcile conflicting values, approve corrections, propagate system-wide</div>
          </div>
        </div>
        <table>
          <tbody>
            <tr><th>Fixture</th><th>Field</th><th>Submitter A</th><th>Value A</th><th>Submitter B</th><th>Value B</th><th>Status</th><th></th></tr>
            {RECONCILIATIONS.map((r) => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.fixture}</div>
                  <div className="mono secondary" style={{ fontSize: 10.5 }}>{r.event}</div>
                </td>
                <td className="mono">{r.field}</td>
                <td className="mono secondary">{r.submitterA}</td>
                <td className="mono">{r.valueA}</td>
                <td className="mono secondary">{r.submitterB}</td>
                <td className="mono">{r.valueB}</td>
                <td>
                  {r.status === 'resolved' && <span className="pill pill-green">Resolved</span>}
                  {r.status === 'open' && <span className="pill pill-amber">Open</span>}
                </td>
                <td>
                  {r.status === 'open' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-primary btn-sm">Resolve</button>
                      <button className="btn btn-ghost btn-sm">Escalate</button>
                    </div>
                  )}
                  {r.status === 'resolved' && r.propagated && <span className="mono secondary" style={{ fontSize: 10.5 }}>Propagated ✓</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="card-note">
          When two submitters report conflicting values for the same event field, the system flags it for admin review. Resolved corrections are appended to the event log (never overwritten) and propagated to all dependent projections — driver stats, team stats, and head-to-head records are recomputed automatically.
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><div className="card-title">Correction propagation log</div><span className="card-title-sub">Last 5 system-wide corrections</span></div>
        <div className="audit-entry">
          <div className="audit-dot flag"></div>
          <div>
            <div className="audit-time">Oct 20, 2026 · 14:11:07 UTC</div>
            <div className="audit-head">Mexico City GP · event_00984 — flag_type corrected</div>
            <div className="audit-meta">SAFETY_CAR → <b>VIRTUAL_SAFETY_CAR</b> · resolved by admin_01 · propagated to 3 projections</div>
          </div>
        </div>
        <div className="audit-entry">
          <div className="audit-dot"></div>
          <div>
            <div className="audit-time">Oct 18, 2026 · 09:44:22 UTC</div>
            <div className="audit-head">Suzuka GP · event_01204 — lap_time_ms corrected</div>
            <div className="audit-meta">91234 → <b>91287</b> · telemetry source preferred · resolved by admin_03 · propagated to 2 projections</div>
          </div>
        </div>
        <div className="audit-entry">
          <div className="audit-dot flag"></div>
          <div>
            <div className="audit-time">Oct 12, 2026 · 17:30:51 UTC</div>
            <div className="audit-head">Austin GP · event_03310 — pit_duration_ms corrected</div>
            <div className="audit-meta">22800 → <b>23100</b> · resolved by admin_01 · propagated to 2 projections</div>
          </div>
        </div>
        <div className="audit-entry">
          <div className="audit-dot"></div>
          <div>
            <div className="audit-time">Oct 05, 2026 · 12:08:33 UTC</div>
            <div className="audit-head">Marina Bay GP · event_02077 — final_position corrected</div>
            <div className="audit-meta">P5 → <b>P6</b> · post-race penalty applied · resolved by admin_02 · propagated to 4 projections</div>
          </div>
        </div>
        <div className="audit-entry">
          <div className="audit-dot flag"></div>
          <div>
            <div className="audit-time">Sep 28, 2026 · 20:55:19 UTC</div>
            <div className="audit-head">Zandvoort GP · event_05588 — tyre compound corrected</div>
            <div className="audit-meta">MEDIUM → <b>HARD</b> · resolved by admin_01 · propagated to 1 projection</div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

function AdminPage() {
  const [activeTab, setActiveTab] = useState('Submitters');

  return (
    <div className="page" id="page-admin">
      <div className="pagehead">
        <div className="section-eyebrow">System administration</div>
        <div className="section-title">Admin</div>
        <div className="section-desc">
          Centralized control over submitters, API access, dataset releases, versioning, and data reconciliation — the full governance surface of the platform.
        </div>
      </div>
      <div className="content">
        <div className="rationale">
          <span className="ic">◆</span>
          <div>
            <b>Why this page:</b> the administrator is the only role with authority across the entire data pipeline — from who can submit data, to which API keys are live, to how conflicting values are resolved and corrections ripple through every projection. This page consolidates that governance surface into five sections matching each distinct responsibility.
          </div>
        </div>

        <div className="tabs" style={{ marginBottom: 18 }}>
          {ADMIN_TABS.map((tab) => (
            <div
              key={tab}
              className={`tab${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </div>
          ))}
        </div>

        {activeTab === 'Submitters' && <SubmittersTab />}
        {activeTab === 'API Keys' && <ApiKeysTab />}
        {activeTab === 'Dataset Releases' && <DatasetReleasesTab />}
        {activeTab === 'API Versions' && <ApiVersionsTab />}
        {activeTab === 'Reconciliation' && <ReconciliationTab />}
      </div>
    </div>
  );
}

export default AdminPage;
