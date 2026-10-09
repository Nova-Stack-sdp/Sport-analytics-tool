import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getStatistics } from '../api/client';
import { formatLapTime as lapTime } from '../utils/eventDetails';
import { percent } from '../utils/eventLabels';

// Tabs map to the API's ?view=. The current tab, season and fixture live in
// the address, so a view can be linked to (Fixtures links straight to
// ?view=fixture&session=<id>) and survives a refresh.
const TABS = [
  { view: 'season', label: 'Season' },
  { view: 'career', label: 'Career' },
  { view: 'fixture', label: 'Fixture' },
  { view: 'constructors', label: 'Constructors' },
];
const VIEWS = TABS.map((t) => t.view);

function formatLapTime(ms) {
  return lapTime(ms) ?? '—';
}

function formatPitTime(ms) {
  if (ms == null) return '—';
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatPoints(points) {
  if (points == null) return '—';
  return Number.isInteger(points) ? points : points.toFixed(1);
}

// Dark text on light team colours, white on dark ones.
function textOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#111' : '#fff';
}

// The team's colour and short code, from the API (every team, not just a
// few hardcoded ones). Links to the team's page when the team is known.
function TeamTag({ row }) {
  if (!row.teamName) return <span className="secondary">—</span>;
  const tag = (
    <span
      className="team-tag"
      style={{ background: row.teamColor, borderColor: row.teamColor, color: textOn(row.teamColor) }}
      title={row.teamName}
      aria-label={row.teamName}
    >
      {row.teamCode ?? row.teamName}
    </span>
  );
  return row.teamId ? <Link to={`/team/${row.teamId}`} aria-label={row.teamName} style={{ textDecoration: 'none' }}>{tag}</Link> : tag;
}

function DriverLink({ row }) {
  return <Link className="data-link" to={`/driver/${row.driverId}`}>{row.name}</Link>;
}

function positionsGained(value) {
  if (value == null) return '—';
  return value > 0 ? `+${value}` : value;
}

// Fixture picker options grouped by season, newest first.
function groupSessions(sessions) {
  const groups = new Map();
  for (const s of sessions) {
    const key = s.season ?? 'Other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  return [...groups.entries()];
}

function StatisticsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = VIEWS.includes(searchParams.get('view')) ? searchParams.get('view') : 'season';
  const seasonParam = searchParams.get('season');
  const season = seasonParam ? Number(seasonParam) : null;
  const sessionId = searchParams.get('session');

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  function updateParams(next) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === undefined || value === '') params.delete(key);
      else params.set(key, String(value));
    }
    setSearchParams(params, { replace: true });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = { view };
    if ((view === 'season' || view === 'constructors') && season != null) params.season = season;
    if (view === 'fixture' && sessionId) params.sessionId = sessionId;

    getStatistics(params)
      .then((result) => {
        if (!cancelled) setData(result);
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
  }, [view, season, sessionId]);

  // Ignore a response that belongs to the previous tab while the next loads.
  const current = data?.view === view ? data : null;
  const rows = current?.rows ?? [];
  const shownSeason = current?.season ?? season;
  const shownSessionId = current?.sessionId ?? sessionId;
  const sessionGroups = useMemo(() => groupSessions(current?.availableSessions ?? []), [current]);

  return (
    <div className="page" id="page-statistics">
      <div className="pagehead">
        <div className="section-eyebrow">Derived data</div>
        <div className="section-title">Statistics</div>
        <div className="section-desc">
          Drivers' and constructors' figures for a season, a whole career, or a single fixture — all calculated from the event log, never entered by hand.
        </div>
      </div>
      <div className="content">
        <div className="card">
          <div className="tabs" role="tablist">
            {TABS.map((tab) => (
              <div
                key={tab.view}
                role="tab"
                aria-selected={view === tab.view}
                className={`tab${view === tab.view ? ' active' : ''}`}
                onClick={() => updateParams({ view: tab.view })}
              >
                {tab.label}
              </div>
            ))}
          </div>

          {(view === 'season' || view === 'constructors') && current?.availableSeasons?.length > 0 && (
            <select
              aria-label="Season"
              value={shownSeason ?? ''}
              onChange={(e) => updateParams({ season: e.target.value })}
              style={{ marginBottom: 12 }}
            >
              {current.availableSeasons.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}

          {view === 'fixture' && sessionGroups.length > 0 && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
              <select
                aria-label="Fixture"
                value={shownSessionId ?? ''}
                onChange={(e) => updateParams({ session: e.target.value })}
              >
                {sessionGroups.map(([groupSeason, sessions]) => (
                  <optgroup key={groupSeason} label={String(groupSeason)}>
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {shownSessionId && (
                <Link className="data-link" to={`/fixtures?session=${encodeURIComponent(shownSessionId)}`}>
                  See the events behind these figures
                </Link>
              )}
            </div>
          )}

          {error && <p className="secondary">Couldn't load the statistics: {error}.</p>}

          {loading && !error && <p className="secondary">Loading statistics…</p>}

          {!loading && !error && rows.length === 0 && (
            <p className="secondary">No figures derived yet for this view.</p>
          )}

          {!loading && !error && rows.length > 0 && (view === 'season' || view === 'career') && (
            <table>
              <tbody>
                <tr>
                  <th>Pos</th>
                  <th>Driver</th>
                  <th>Team</th>
                  <th>Points</th>
                  <th>Wins</th>
                  <th>Podiums</th>
                  <th>Fastest lap</th>
                  <th>{view === 'career' ? 'Seasons' : 'Races'}</th>
                </tr>
                {rows.map((row, i) => (
                  <tr key={row.driverId}>
                    <td>{i + 1}</td>
                    <td><DriverLink row={row} /></td>
                    <td><TeamTag row={row} /></td>
                    <td className={i === 0 ? 'mono' : 'mono secondary'}>{formatPoints(row.points)}</td>
                    <td className="mono secondary">{row.wins ?? '—'}</td>
                    <td className="mono secondary">{row.podiums ?? '—'}</td>
                    <td className="mono secondary">{formatLapTime(row.fastestLapMs)}</td>
                    <td className="mono secondary">{view === 'career' ? row.seasonsCount : row.racesCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && !error && rows.length > 0 && view === 'constructors' && (
            <table>
              <tbody>
                <tr>
                  <th>Pos</th>
                  <th>Team</th>
                  <th>Points</th>
                  <th>Wins</th>
                  <th>Reliability</th>
                </tr>
                {rows.map((row, i) => (
                  <tr key={row.teamId}>
                    <td>{i + 1}</td>
                    <td>
                      <TeamTag row={row} />{' '}
                      {row.teamId ? <Link className="data-link" to={`/team/${row.teamId}`}>{row.name}</Link> : row.name}
                    </td>
                    <td className={i === 0 ? 'mono' : 'mono secondary'}>{formatPoints(row.points)}</td>
                    <td className="mono secondary">{row.wins}</td>
                    <td className="mono secondary" title="Share of starts that ended without a retirement">
                      {percent(row.reliabilityRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && !error && rows.length > 0 && view === 'fixture' && (
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
                    <td><DriverLink row={row} /></td>
                    <td><TeamTag row={row} /></td>
                    <td className="mono secondary">{formatPoints(row.points)}</td>
                    <td className="mono secondary">{formatLapTime(row.fastestLapMs)}</td>
                    <td className="mono secondary">{formatLapTime(row.avgLapMs)}</td>
                    <td className="mono secondary">{formatPitTime(row.totalPitTimeMs)}</td>
                    <td className="mono secondary">{positionsGained(row.positionsGained)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="card-note">
            Figures count only published data: OpenF1 syncs and developer uploads an admin has accepted. Click a driver or team for their profile; on the Fixture tab, open the event log behind the figures.
          </div>
        </div>
      </div>
    </div>
  );
}

export default StatisticsPage;
