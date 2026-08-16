import React from 'react';

export default function FixturesEvents({ onNavigate }) {
  return (
    <div className="page" id="page-fixtures">
      <div className="pagehead">
        <div className="section-eyebrow">Core data model</div>
        <div className="section-title">Fixtures &amp; Events</div>
        <div className="section-desc">
          Every statistic the platform publishes is derived from a record of individual events in the order they occurred — this page is where that record lives.
        </div>
      </div>
      <div className="content">
        <div className="rationale">
          <span className="ic">◆</span>
          <div>
            <b>Why this page:</b> the brief's basic tier is explicit that the platform is "built on event data" and statistics must be "derived from a record of the individual events that occurred during a single fixture... rather than stored as a total that somebody typed in." Nothing else in the app can be trusted unless this layer is visible and inspectable, so it gets its own page rather than being buried inside a dashboard widget.
          </div>
        </div>

        <div className="grid grid-2">
          <div className="card">
            <div className="card-head"><div className="card-title">Fixtures</div></div>
            <table>
              <tbody>
                <tr><th>Fixture</th><th>Date</th><th>Status</th></tr>
                <tr className="clickable"><td>Miami Grand Prix</td><td className="secondary mono">2026-05-04</td><td><span className="pill pill-red live-blink">Live</span></td></tr>
                <tr className="clickable" style={{ background: 'var(--border-soft)' }}><td>Monaco Grand Prix</td><td className="secondary mono">2026-05-25</td><td><span className="pill pill-green">Completed</span></td></tr>
                <tr className="clickable"><td>Canadian Grand Prix</td><td className="secondary mono">2026-06-08</td><td><span className="pill pill-green">Completed</span></td></tr>
                <tr className="clickable"><td>Mexico City Grand Prix</td><td className="secondary mono">2026-10-18</td><td><span className="pill pill-blue">Corrected</span></td></tr>
                <tr className="clickable"><td>Brazilian Grand Prix</td><td className="secondary mono">2026-11-01</td><td><span className="pill pill-gray">Scheduled</span></td></tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Event log</div>
                <div className="card-title-sub">Monaco Grand Prix · fixture_00231</div>
              </div>
            </div>
            <div className="log-ticker">
              <div className="log-row"><span className="log-time">14:02:11</span><span className="pill pill-green" style={{ justifySelf: 'start' }}>#00981</span><span className="log-event">Leclerc</span><span className="mono secondary">LAP_COMPLETED</span></div>
              <div className="log-row"><span className="log-time">14:02:44</span><span className="pill pill-green" style={{ justifySelf: 'start' }}>#00982</span><span className="log-event">Verstappen</span><span className="mono secondary">OVERTAKE</span></div>
              <div className="log-row"><span className="log-time">14:03:02</span><span className="pill pill-green" style={{ justifySelf: 'start' }}>#00983</span><span className="log-event">Hamilton</span><span className="mono secondary">PIT_STOP</span></div>
              <div className="log-row"><span className="log-time">14:03:19</span><span className="pill pill-blue" style={{ justifySelf: 'start' }}>#00984</span><span className="log-event">Perez</span><span className="mono secondary">SAFETY_CAR</span></div>
              <div className="log-row"><span className="log-time">14:03:51</span><span className="pill pill-green" style={{ justifySelf: 'start' }}>#00985</span><span className="log-event">Russell</span><span className="mono secondary">DRS_ENABLED</span></div>
            </div>
            <div className="derived-note">
              <span className="dot"></span> 5 stats recomputed from this fixture's event log ·{' '}
              <a href="#!" onClick={(e) => { e.preventDefault(); onNavigate('statistics'); }} style={{ color: 'var(--info)', textDecoration: 'none' }}>view derived statistics</a>
            </div>
            <div className="card-note">Correcting an event here (e.g. reclassifying #00984) automatically recomputes every statistic derived from it — nothing needs re-entry.</div>
          </div>
        </div>
      </div>
    </div>
  );
}