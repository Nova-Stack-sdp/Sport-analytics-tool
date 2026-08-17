import { Link } from 'react-router-dom';

function TimeTravelPage() {
  return (
    <div className="page" id="page-timetravel">
      <div className="pagehead">
        <div className="section-eyebrow">Advanced · historical state</div>
        <div className="section-title">Time-Travel &amp; Audit</div>
        <div className="section-desc">
          What a statistic was as of a given date, and what changed between two dataset releases — since corrections keep arriving after publication.
        </div>
      </div>
      <div className="content">
        <div className="rationale">
          <span className="ic">◆</span>
          <div>
            <b>Why this page:</b> the advanced tier specifically asks the platform to "say what a statistic was as of a given date rather than only what it is now, and... let a consumer see what changed between two dataset releases." That's a fundamentally different interaction from Statistics (which shows current figures) — so rather than overload one page with a "current vs. historical" toggle, it gets a dedicated audit-focused page.
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="timeline-wrap">
            <div className="timeline-track">
              <div className="timeline-fill"></div>
              <div className="tl-point done" style={{ left: '0%' }}></div>
              <div className="tl-point selected" style={{ left: '56%' }}></div>
              <div className="tl-point" style={{ left: '100%' }}></div>
              <div className="tl-label" style={{ left: '0%' }}><div className="d">Oct 16, 2026</div><div className="s">Pre-race</div></div>
              <div className="tl-label" style={{ left: '56%' }}><div className="d">Oct 18, 2026</div><div className="s">Race completed</div></div>
              <div className="tl-label" style={{ left: '100%' }}><div className="d">Oct 22, 2026</div><div className="s">Post audits</div></div>
            </div>
          </div>
          <div className="selected-banner">● Selected state: Oct 18 audit</div>
        </div>

        <div className="grid grid-2">
          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Change log</div>
                <div className="card-title-sub">Max Verstappen · Points scored</div>
              </div>
            </div>
            <div className="audit-entry">
              <div className="audit-dot"></div>
              <div>
                <div className="audit-time">Oct 18, 2026 · 18:25:59 UTC</div>
                <div className="audit-head">Original record</div>
                <div className="audit-meta">Points scored: <b>25</b> · derived from Mexico City fixture events</div>
              </div>
            </div>
            <div className="audit-entry">
              <div className="audit-dot flag"></div>
              <div>
                <div className="audit-time">Oct 20, 2026 · 14:11:07 UTC</div>
                <div className="audit-head">Audit adjustment <span className="pill pill-amber" style={{ marginLeft: 4 }}>+1</span></div>
                <div className="audit-meta">Points scored: <b>26</b> · steward decision, fastest-lap bonus applied</div>
                <div className="audit-meta">Ref DOC-2026-MEX-45 · propagated to season &amp; career aggregates</div>
              </div>
            </div>
            <div className="card-note">Nothing is overwritten. Every figure is versioned and reconstructable as of any date.</div>
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">Compare dataset releases</div></div>
            <div className="compare-select">
              <select><option>v2026.10.18</option></select>
              <span className="secondary">vs.</span>
              <select><option>v2026.10.20</option></select>
            </div>
            <table>
              <tbody>
                <tr><th>Field</th><th>v10.18</th><th>v10.20</th></tr>
                <tr><td>Verstappen — points</td><td className="mono"><span className="diff-rem">25</span></td><td className="mono"><span className="diff-add">26</span></td></tr>
                <tr><td>Constructor standings — RED</td><td className="mono"><span className="diff-rem">411</span></td><td className="mono"><span className="diff-add">412</span></td></tr>
                <tr><td>Fixtures affected</td><td className="mono secondary">—</td><td className="mono">1</td></tr>
              </tbody>
            </table>
            <Link to="/datasets" className="btn btn-ghost btn-full" style={{ marginTop: 14 }}>View dataset releases</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TimeTravelPage;
