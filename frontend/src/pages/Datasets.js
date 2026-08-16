import React from 'react';

export default function Datasets() {
  return (
    <div className="page" id="page-datasets">
      <div className="pagehead">
        <div className="section-eyebrow">Intermediate · distribution</div>
        <div className="section-title">Datasets</div>
        <div className="section-desc">
          Versioned snapshots published with their schema, field descriptions, and a checksum — so an analysis run today reproduces the same numbers later.
        </div>
      </div>
      <div className="content">
        <div className="rationale">
          <span className="ic">◆</span>
          <div>
            <b>Why this page:</b> the brief distinguishes an ad-hoc export from a proper release: "the datasets should become releases rather than ad-hoc downloads: versioned snapshots published with their schema... and a checksum." That reproducibility guarantee is the whole point of this page — it's separate from the Developer page because it's aimed at analysts doing offline research, not integrators calling the live API.
          </div>
        </div>

        <div className="grid grid-2" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="card-head"><div className="card-title">Build a custom export</div></div>
            <div className="kv"><span>Dataset</span><b>2026 season · full event log</b></div>
            <div className="kv"><span>Filter</span><b>drivers, teams</b></div>
            <div className="kv"><span>Format</span><b>CSV</b></div>
            <button className="btn btn-primary btn-full" style={{ marginTop: 14 }}>Request export</button>
            <div className="card-note">Large requests are handed off as a job — come back once it's ready rather than waiting on the request.</div>
          </div>
          <div className="card">
            <div className="card-head"><div className="card-title">Export jobs</div></div>
            <table>
              <tbody>
                <tr><th>Job</th><th>Status</th><th>Progress</th><th></th></tr>
                <tr><td>Full event log</td><td><span className="pill pill-amber">Processing</span></td><td><div className="mini-progress"><div style={{ width: '64%' }}></div></div></td><td className="secondary mono">64%</td></tr>
                <tr><td>Driver telemetry</td><td><span className="pill pill-green">Ready</span></td><td><div className="mini-progress"><div style={{ width: '100%' }}></div></div></td><td style={{ cursor: 'pointer' }}>⬇</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><div className="card-title">Published releases</div></div>
          <div className="dataset-row" style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            <span>Release</span><span>Fixtures</span><span>Size</span><span>Checksum</span><span></span>
          </div>
          <div className="dataset-row">
            <div><div className="name">v2026.10.20</div><div className="sub">schema v3 · full season</div></div>
            <span className="secondary">312</span><span className="secondary">1.8 GB</span><span className="mono secondary">a92f…c1</span>
            <span className="pill pill-gray">Download</span>
          </div>
          <div className="dataset-row">
            <div><div className="name">v2026.10.18</div><div className="sub">schema v3 · full season</div></div>
            <span className="secondary">311</span><span className="secondary">1.8 GB</span><span className="mono secondary">7e1d…9a</span>
            <span className="pill pill-gray">Download</span>
          </div>
        </div>
      </div>
    </div>
  );
}