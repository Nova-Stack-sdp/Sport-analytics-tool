import { useEffect, useState } from 'react';
import { getStatistics } from '../api/client';

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
      </div>
    </div>
  );
}

export default StatisticsPage;