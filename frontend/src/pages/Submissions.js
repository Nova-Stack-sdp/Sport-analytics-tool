import React, { useState } from 'react';

const REVIEW_TABS = ['Pending', 'Approved', 'Rejected'];

export default function Submissions() {
  const [activeTab, setActiveTab] = useState('Pending');

  return (
    <div className="page" id="page-submissions">
      <div className="pagehead">
        <div className="section-eyebrow">Data intake</div>
        <div className="section-title">Submissions</div>
        <div className="section-desc">
          How event data enters the platform: staged, validated against the event schema, reviewed, and published — with a history behind every correction.
        </div>
      </div>
      <div className="content">
        <div className="rationale">
          <span className="ic">◆</span>
          <div>
            <b>Why this page:</b> the brief treats submission as its own pipeline, not a side effect of an admin panel: "a submission... should be checked against the platform's event schema before it is accepted, and a rejection should tell the submitter what was wrong." At the intermediate tier this becomes a full staging pipeline with resumable batches and a review step before publication — enough distinct stages to warrant a dedicated page.
          </div>
        </div>

        <div className="grid grid-2" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 4 }}>Submit a batch</div>
            <div className="card-title-sub" style={{ marginBottom: 12 }}>.json or .csv, checked against the event schema</div>
            <div className="dropzone">
              <div className="icon">⇪</div>
              <div><b>Drag &amp; drop</b> an event batch file</div>
              <div style={{ marginTop: 2, color: 'var(--text-tertiary)' }}>or click to browse · max 200MB</div>
            </div>
            <div className="pipeline-steps">
              <div className="pstep done"><div className="n">✓</div><div className="t">Staged</div></div>
              <div className="pline"></div>
              <div className="pstep active validating"><div className="n">2</div><div className="t">Validating</div></div>
              <div className="pline"></div>
              <div className="pstep"><div className="n">3</div><div className="t">Reviewed</div></div>
              <div className="pline"></div>
              <div className="pstep"><div className="n">4</div><div className="t">Published</div></div>
            </div>
            <button className="btn btn-ghost btn-full">Download event schema (JSON)</button>

            <div className="error-box">
              <div className="eh">⚠ Batch validation — 1 error found</div>
              <div style={{ display: 'flex', gap: 20, marginBottom: 10, color: '#8A5A17' }}>
                <span>Batch <b>9f3e7b2a</b></span>
                <span>Fixture <b>Brazil GP 2026</b></span>
              </div>
              <table>
                <tbody>
                  <tr><th>Line</th><th>Field</th><th>Value</th><th>Expected</th></tr>
                  <tr><td>157</td><td className="mono">events[17].event_type</td><td className="mono">"TRYY"</td><td className="secondary">TRY, OVERTAKE, PIT_STOP…</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">Review &amp; approval queue</div></div>
            <div className="tabs">
              {REVIEW_TABS.map((tab) => (
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
                <tr><th>Submission</th><th>Submitter</th><th>Window</th><th>Status</th></tr>
                <tr><td>Monaco GP 2026</td><td className="secondary">analyst_042</td><td className="secondary mono">Q1–Race</td><td><span className="pill pill-amber">Pending</span></td></tr>
                <tr><td>US GP 2026</td><td className="secondary">official_017</td><td className="secondary mono">Full event</td><td><span className="pill pill-green">Approved</span></td></tr>
                <tr><td>Brazil GP 2026</td><td className="secondary">analyst_019</td><td className="secondary mono">Race only</td><td><span className="pill status-rejected">Rejected</span></td></tr>
              </tbody>
            </table>
            <div className="card-note" style={{ marginTop: 14 }}>Only approved submitters may submit, each scoped to a defined part of the competition — so every event is traceable to who supplied it.</div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><div className="card-title">Correction history</div><span className="card-title-sub">Mexico City Grand Prix</span></div>
          <div className="audit-entry">
            <div className="audit-dot flag"></div>
            <div>
              <div className="audit-time">Oct 20, 2026 · 14:11:07 UTC</div>
              <div className="audit-head">Event #00984 reclassified <span className="pill pill-amber" style={{ marginLeft: 4 }}>Correction</span></div>
              <div className="audit-meta">SAFETY_CAR → <b>VIRTUAL_SAFETY_CAR</b> · submitted by official_017, approved by review_lead_03</div>
            </div>
          </div>
          <div className="card-note">Corrections don't overwrite — they're appended, so every statistic that depended on the old value stays reconstructable.</div>
        </div>
      </div>
    </div>
  );
}