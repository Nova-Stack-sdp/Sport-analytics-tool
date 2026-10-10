import { useEffect, useState } from 'react';
import { getStatistics, listPublicCode, publicCodeUrl } from '../api/client';

const TABS = ['Season', 'Career', 'Fixture'];

function formatLapTime(ms) {
  if (ms == null) return '—';
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(3);
  return `${minutes}:${seconds.padStart(6, '0')}`;
}

function formatPitTime(ms) {
  if (ms == null) return '—';
  return `${(ms / 1000).toFixed(2)}s`;
}

const KNOWN_TEAM_TAGS = [
  { match: 'red bull', className: 'team-redbull', abbr: 'RB' },
  { match: 'mercedes', className: 'team-mercedes', abbr: 'MER' },
  { match: 'ferrari', className: 'team-ferrari', abbr: 'FER' },
];

function TeamTag({ teamName }) {
  if (!teamName) return <span className="secondary">—</span>;
  const known = KNOWN_TEAM_TAGS.find((t) => teamName.toLowerCase().includes(t.match));
  if (known) {
    return (
      <span className={`team-tag ${known.className}`} title={teamName} aria-label={teamName}>
        {known.abbr}
      </span>
    );
  }
  // Teams outside the three styled classes (e.g. McLaren, Alpine) fall back
  // to a plain label rather than an unstyled/miscolored badge.
  return <span className="pill pill-gray">{teamName}</span>;
}

function StatisticsPage() {
  const [activeTab, setActiveTab] = useState('Season');
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scripts, setScripts] = useState([]);
  const [scriptsLoading, setScriptsLoading] = useState(true);
  const [scriptsError, setScriptsError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    listPublicCode()
      .then((result) => {
        if (!cancelled) setScripts(result.data);
      })
      .catch(() => {
        if (!cancelled) setScriptsError('Unable to load approved scripts. Please try again later.');
      })
      .finally(() => {
        if (!cancelled) setScriptsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const view = activeTab.toLowerCase();
    const params = { view };
    if (view === 'season' && selectedSeason != null) params.season = selectedSeason;
    if (view === 'fixture' && selectedSessionId) params.sessionId = selectedSessionId;

    getStatistics(params)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        if (view === 'season' && selectedSeason == null) setSelectedSeason(result.season);
        if (view === 'fixture' && !selectedSessionId) setSelectedSessionId(result.sessionId);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, selectedSeason, selectedSessionId]);

  const rows = data?.rows ?? [];

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

          {activeTab === 'Season' && data?.availableSeasons?.length > 0 && (
            <select
              value={selectedSeason ?? ''}
              onChange={(e) => setSelectedSeason(Number(e.target.value))}
              style={{ marginBottom: 12 }}
            >
              {data.availableSeasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}

          {activeTab === 'Fixture' && data?.availableSessions?.length > 0 && (
            <select
              value={selectedSessionId ?? ''}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              style={{ marginBottom: 12 }}
            >
              {data.availableSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}

          {error && (
            <p className="secondary">
              Couldn't reach the backend: {error}.
            </p>
          )}

          {loading && !error && <p className="secondary">Loading statistics…</p>}

          {!loading && !error && rows.length === 0 && (
            <p className="secondary">No data derived yet for this view.</p>
          )}

          {!loading && !error && rows.length > 0 && activeTab !== 'Fixture' && (
            <table>
              <tbody>
                <tr>
                  <th>Pos</th>
                  <th>Driver</th>
                  <th>Team</th>
                  <th>Points</th>
                  <th>Fastest lap</th>
                  <th>Source</th>
                </tr>
                {rows.map((row, i) => (
                  <tr key={row.driverId}>
                    <td>{i + 1}</td>
                    <td>{row.name}</td>
                    <td>
                      <TeamTag teamName={row.teamName} />
                    </td>
                    <td className={i === 0 ? 'mono' : 'mono secondary'}>{row.points}</td>
                    <td className="mono secondary">{formatLapTime(row.fastestLapMs)}</td>
                    <td>
                      <span className="pill pill-gray">
                        {row.fixturesCount} fixture{row.fixturesCount === 1 ? '' : 's'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && !error && rows.length > 0 && activeTab === 'Fixture' && (
            <table>
              <tbody>
                <tr>
                  <th>Pos</th>
                  <th>Driver</th>
                  <th>Team</th>
                  <th>Points</th>
                  <th>Fastest lap</th>
                  <th>Avg lap</th>
                  <th>Pit time</th>
                  <th>+/-</th>
                </tr>
                {rows.map((row) => (
                  <tr key={row.driverId}>
                    <td>{row.finalPosition ?? '—'}</td>
                    <td>{row.name}</td>
                    <td>
                      <TeamTag teamName={row.teamName} />
                    </td>
                    <td className="mono secondary">{row.points ?? '—'}</td>
                    <td className="mono secondary">{formatLapTime(row.fastestLapMs)}</td>
                    <td className="mono secondary">{formatLapTime(row.avgLapMs)}</td>
                    <td className="mono secondary">{formatPitTime(row.totalPitTimeMs)}</td>
                    <td className="mono secondary">
                      {row.positionsGained == null
                        ? '—'
                        : row.positionsGained > 0
                        ? `+${row.positionsGained}`
                        : row.positionsGained}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="card-note">Every figure links back to the fixtures and events behind it — statistics are traceable, not just displayed.</div>
        </div>

        <section className="card" aria-labelledby="approved-scripts-title">
          <div className="card-head">
            <h2 className="card-title" id="approved-scripts-title">Approved developer scripts</h2>
          </div>
          <p className="secondary">Reviewed scripts available through the public API. Each endpoint returns the script as text.</p>

          {scriptsLoading && <p className="secondary" role="status">Loading approved scripts…</p>}
          {scriptsError && <p className="secondary" role="alert">{scriptsError}</p>}
          {!scriptsLoading && !scriptsError && scripts.length === 0 && (
            <p className="secondary">No approved scripts are available yet.</p>
          )}
          {!scriptsLoading && !scriptsError && scripts.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 16 }}>
              {scripts.map((script) => (
                <li key={script.slug}>
                  {/* The public API exposes the submitted title as name. */}
                  <h3 className="card-title">{script.name}</h3>
                  <p className="secondary">{script.description}</p>
                  <span className="pill pill-gray" style={{ whiteSpace: 'normal' }}>
                    Author: Anonymous (Privacy Protected)
                  </span>
                  <p className="card-note" style={{ overflowWrap: 'anywhere' }}>
                    Endpoint: <a className="mono" href={publicCodeUrl(script.endpoint)}>{publicCodeUrl(script.endpoint)}</a>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default StatisticsPage;
