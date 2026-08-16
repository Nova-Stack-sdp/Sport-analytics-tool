import React from 'react';

export default function Developer() {
  return (
    <div className="page" id="page-developer">
      <div className="pagehead">
        <div className="section-eyebrow">Basic → advanced · the API is the product</div>
        <div className="section-title">Developer</div>
        <div className="section-desc">
          Keys, rate limits, versioning and usage — the brief treats the API as the platform's product, not an accessory to the web interface.
        </div>
      </div>
      <div className="content">
        <div className="rationale">
          <span className="ic">◆</span>
          <div>
            <b>Why this page:</b> "the API is the platform's product rather than an accessory to a web interface" runs through all three tiers — from basic filtering/pagination, to intermediate versioning/keys/quotas, to advanced deprecation paths and per-consumer usage visibility. That's a distinct audience (integrators, not analysts) and enough surface area to earn its own page rather than a tab elsewhere.
          </div>
        </div>

        <div className="grid grid-2" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">Rate limits &amp; keys</div>
              <span className="pill pill-gray">Pro Developer</span>
            </div>
            <div className="kv"><span>API key</span><b>dev_7f8c….ab92</b></div>
            <div className="kv"><span>API version</span><b>v3 <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(v2 deprecates Dec 2026)</span></b></div>
            <div className="kv"><span>Quota</span><b>1000 / min</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 14 }}><span>Bucket level</span><span>740 / 1000</span></div>
            <div className="progress-bar"><div className="progress-fill" style={{ width: '74%' }}></div></div>
            <button className="btn btn-ghost btn-full" style={{ marginTop: 8 }}>View usage history</button>
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">Change feed</div><span className="card-title-sub">Pull only what changed since last read</span></div>
            <table>
              <tbody>
                <tr><th>Since</th><th>Event</th><th>Fixture</th></tr>
                <tr><td className="mono secondary">v10.18</td><td>stat_corrected</td><td className="secondary">Mexico City GP</td></tr>
                <tr><td className="mono secondary">v10.17</td><td>fixture_published</td><td className="secondary">Brazilian GP</td></tr>
              </tbody>
            </table>
            <div className="card-note">Lets a consumer already holding a release pull only the difference, instead of re-downloading everything.</div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><div className="card-title">API endpoints</div></div>
          <div className="endpoint-row"><span className="method get">GET</span><span className="path">/v3/fixtures</span><span className="desc">Fixtures, filterable &amp; paginated</span><span className="secondary">Stable</span></div>
          <div className="endpoint-row"><span className="method get">GET</span><span className="path">/v3/events</span><span className="desc">Raw event stream for a fixture</span><span className="secondary">Stable</span></div>
          <div className="endpoint-row"><span className="method get">GET</span><span className="path">/v3/statistics</span><span className="desc">Derived driver / team statistics</span><span className="secondary">Stable</span></div>
          <div className="endpoint-row"><span className="method get">GET</span><span className="path">/v3/statistics/as-of</span><span className="desc">Historical statistic snapshot</span><span className="pill pill-blue" style={{ justifySelf: 'start' }}>Advanced</span></div>
          <div className="endpoint-row"><span className="method post">POST</span><span className="path">/v3/submissions</span><span className="desc">Submit an event batch</span><span className="secondary">Stable</span></div>
          <div className="endpoint-row"><span className="method post">POST</span><span className="path">/v3/exports</span><span className="desc">Request a filtered dataset export</span><span className="secondary">Stable</span></div>
          <button className="btn btn-ghost btn-full" style={{ marginTop: 14 }}>View full API documentation</button>
        </div>

        <div className="card">
          <div className="card-head"><div className="card-title">Access &amp; security</div></div>
          <div className="security-grid">
            <div className="sec-card"><div className="sec-icon">🔑</div><div className="sec-title">API keys</div><div className="sec-desc">Manage and rotate your keys</div><div className="sec-link">Manage keys →</div></div>
            <div className="sec-card"><div className="sec-icon">⇄</div><div className="sec-title">Webhooks</div><div className="sec-desc">Subscribe to the change feed</div><div className="sec-link">Manage webhooks →</div></div>
            <div className="sec-card"><div className="sec-icon">◎</div><div className="sec-title">Usage by consumer</div><div className="sec-desc">See what each key has accessed</div><div className="sec-link">View usage →</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}