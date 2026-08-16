import { useState } from 'react';

const TABS = ['Season', 'Career', 'Fixture'];

function StatisticsPage() {
  const [activeTab, setActiveTab] = useState('Season');

  return (
    <div className="page" id="page-statistics">
      <div className="pagehead">
        <div className="section-eyebrow">Derived data</div>
        <div className="section-title">Statistics</div>
        <div className="section-desc">
          Fixture, season, career and competition-wide figures — all computed from the event log, never entered by hand.
        </div>
      </div>
      <div className="content">
        <div className="rationale">
          <span className="ic">◆</span>
          <div>
            <b>Why this page:</b> the intermediate tier asks derivation to "reach beyond a single fixture, to season, career, and competition-wide aggregates." That's a distinct browsing task from looking at one fixture's raw events, so it's split out — this is where an analyst goes to consume figures, Fixtures &amp; Events is where they go to audit how those figures were produced.
          </div>
        </div>

        <div className="card">
          <div className="tabs">
            {TABS.map((tab) => (
              <div
                key={tab}
                className={`tab${activeTab === tab ? ' active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </div>
            ))}
          </div>
          <table>
            <tbody>
              <tr><th>Pos</th><th>Driver</th><th>Team</th><th>Points</th><th>Fastest lap</th><th>Source</th></tr>
              <tr><td>1</td><td>Max Verstappen</td><td><span className="team-tag team-redbull" title="Red Bull Racing" aria-label="Red Bull Racing">RB</span></td><td className="mono">186</td><td className="mono secondary">1:18.402</td><td><span className="pill pill-gray">14 fixtures</span></td></tr>
              <tr><td>2</td><td>Sergio Perez</td><td><span className="team-tag team-redbull" title="Red Bull Racing" aria-label="Red Bull Racing">RB</span></td><td className="mono secondary">100</td><td className="mono secondary">1:19.011</td><td><span className="pill pill-gray">14 fixtures</span></td></tr>
              <tr><td>3</td><td>Lewis Hamilton</td><td><span className="team-tag team-mercedes" title="Mercedes" aria-label="Mercedes">MER</span></td><td className="mono secondary">94</td><td className="mono secondary">1:19.204</td><td><span className="pill pill-gray">14 fixtures</span></td></tr>
              <tr><td>4</td><td>George Russell</td><td><span className="team-tag team-mercedes" title="Mercedes" aria-label="Mercedes">MER</span></td><td className="mono secondary">74</td><td className="mono secondary">1:19.552</td><td><span className="pill pill-gray">14 fixtures</span></td></tr>
              <tr><td>5</td><td>Charles Leclerc</td><td><span className="team-tag team-ferrari" title="Ferrari" aria-label="Ferrari">FER</span></td><td className="mono secondary">65</td><td className="mono secondary">1:19.610</td><td><span className="pill pill-gray">14 fixtures</span></td></tr>
            </tbody>
          </table>
          <div className="card-note">Every figure links back to the fixtures and events behind it — statistics are traceable, not just displayed.</div>
        </div>
      </div>
    </div>
  );
}

export default StatisticsPage;
