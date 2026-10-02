import { useMemo } from 'react';
// Read-only reuse of Race Replay's team-name → palette-key mapper, so a line on
// a chart carries the same colour as that team's marker on the map above it.
import { teamClassFor } from '../race-replay/raceReplayHelpers';
import { useRaceSyncSelection } from './RaceSyncSelection';
import { useRaceSyncLapSeries } from './useRaceSyncLapSeries';
import { driverPhotoUrl, useRaceSyncPeople } from './useRaceSyncPeople';
import { entryInScope, isScopeActive, scopeLabel } from './raceSyncViewScope';
import { displayName, driverCode } from './raceSyncDriverNames';
// The ids the section rail jumps to (see raceSyncAnchors): each card the rail
// can reach carries its own anchor, so the two cannot drift apart.
import { SECTION_ANCHORS } from './raceSyncAnchors';
import {
  chartDomain,
  compoundChip,
  driverSummary,
  formatDelta,
  formatGap,
  formatLapTime,
  lapTraces,
  paceRows,
  pitStops,
  plottedValue,
  readingsCsv,
  readingsCsvFilename,
  stintSegments,
  stopCounts,
} from './raceSyncReadings';

// The analysis panels under the map: the same race, read as numbers instead of
// as positions on a circuit. Six readings of one replay — where the field is,
// how quick each car is, what its tyres have done, what the stops cost, and how
// every lap compares with the pace being watched — all drawn from the race
// replay series (see useRaceSyncLapSeries) and all following the same two
// things the map follows: the view scope in the header, and the playhead. A
// panel never shows a lap the replay hasn't reached. (How each reading is
// derived lives beside this file, in raceSyncReadings — the same split the map
// and the view scope already use.)
//
// Each panel says what it plots rather than what a mockup promised. Where the
// synced data has no speed, brake, gear or sector channels to plot — it has
// none, for any session — the panel draws the reading the data does support and
// labels it as that.

// A panel: a title, an optional caption on the right, and its body. Wide panels
// take both grid columns, which is what a lap-by-lap chart needs. `slot` names
// the place the design gives a reading — the cards down the map's left and
// right; the two charts carry none, so they fall in across the width under the
// lot.
function Panel({ title, caption, wide, rail, slot, anchor, children }) {
  return (
    <section
      className={`racesync-panel${wide ? ' is-wide' : ''}${rail ? ' is-rail' : ''}${
        slot ? ` is-slot-${slot}` : ''
      }`}
      id={anchor}
      aria-label={title}
    >
      <header className="racesync-panel-head">
        <h3 className="racesync-panel-title">{title}</h3>
        {caption && <span className="racesync-panel-caption">{caption}</span>}
      </header>
      <div className="racesync-panel-body">{children}</div>
    </section>
  );
}

// The tyre, as the timing screens show it: one letter in the compound's own
// colour, with the full name in the tooltip.
function TyreChip({ compound }) {
  const chip = compoundChip(compound);
  if (!chip) return <span className="racesync-tyre-none">—</span>;
  return (
    <span
      className={`racesync-tyre racesync-tyre-${chip.key}`}
      title={chip.label}
      aria-label={chip.label}
    >
      {chip.letter}
    </span>
  );
}

// The dot a driver is introduced by everywhere on this page — the map's legend
// uses the same class, through the same team palette — with the code and the
// surname beside it, wrapped so a panel introduces a driver as one piece.
function DriverTag({ driverName, teamName }) {
  return (
    <span className="racesync-driver-tag">
      <span
        className={`racesync-stage-legend-dot racesync-car-${teamClassFor(teamName)}`}
        aria-hidden="true"
      />
      <span className="racesync-panel-code">{driverCode(driverName)}</span>
      <span className="racesync-panel-name">{displayName(driverName)}</span>
    </span>
  );
}

// Literally no laps yet — the replay is parked on the grid. Every series-based
// panel opens on this instead of an empty chart frame.
const NoLaps = () => <p className="racesync-panel-empty">No laps run yet.</p>;

// The export itself: the CSV handed to the browser's own download machinery
// through a throwaway anchor — a file made on this page, from the readings
// already on it, with no server round trip and nothing uploaded.
function downloadCsv(filename, csv) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// One sentence, and only when there is something to say: a chart that had to
// leave intervals out says so in words rather than drawing a spike that reads
// as a lap. (The intervals themselves are counted in raceSyncReadings, under
// LAP_TIME_CEILING_SECONDS.)
function stoppageNote(count) {
  if (!count) return null;
  return count === 1
    ? 'One interval on this chart runs over ten minutes — a stoppage in the race, not a lap — so it isn’t drawn.'
    : `${count} intervals on this chart run over ten minutes — stoppages in the race, not laps — so they aren’t drawn.`;
}

// The chart every lap-by-lap panel is drawn with, by hand and in SVG for the
// same reason the map is: two polylines and a baseline are not worth a charting
// library, and none is installed anywhere in this app. Drawn into a fixed
// viewBox that stretches to its box, with non-scaling strokes so a line keeps
// its weight at any width — the same trick the trace above the panels uses.
const CHART_WIDTH = 1000;
const CHART_HEIGHT = 220;

function LapChart({ traces, reference, mode, uptoLap, totalLaps, label }) {
  const domain = chartDomain({ traces, reference, mode });
  if (!domain) return <p className="racesync-panel-empty">No timed laps to plot yet.</p>;

  const lastLap = Math.max(
    totalLaps ?? 0,
    ...traces.flatMap((trace) => trace.points.map((point) => point.lap)),
    1
  );
  const plotLap = Math.min(Math.max(uptoLap, 1), lastLap);
  const scaleX = (lapNumber) => ((lapNumber - 1) / (lastLap - 1 || 1)) * CHART_WIDTH;
  const scaleY = (value) =>
    CHART_HEIGHT - ((value - domain.min) / (domain.max - domain.min || 1)) * CHART_HEIGHT;
  const axisValue = (value) => (mode === 'delta' ? formatDelta(value) : formatLapTime(value));

  return (
    <div className="racesync-chart">
      <div className="racesync-chart-scale" aria-hidden="true">
        <span>{axisValue(domain.max)}</span>
        <span>{axisValue(domain.min)}</span>
      </div>
      <div className="racesync-chart-plot">
        {/* The lines are decoration to a screen reader, which cannot read a
            polyline; the chart announces what it draws and how many cars are
            on it instead, with the axis text below and the legend under that
            carrying the rest. */}
        <svg
          className="racesync-chart-svg"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${label} — ${traces.length} ${traces.length === 1 ? 'driver' : 'drivers'}`}
        >
          <line
            className="racesync-chart-floor"
            x1="0"
            y1={CHART_HEIGHT}
            x2={CHART_WIDTH}
            y2={CHART_HEIGHT}
          />
          {traces.map((trace) => {
            const points = trace.points.map(
              (point) => `${scaleX(point.lap)},${scaleY(plottedValue(point, { mode, reference }))}`
            );
            if (points.length === 0) return null;
            // One lap is not a line: an opening lap gets a short flat mark so
            // the race's first lap is visible at all.
            if (points.length === 1) {
              points.push(`${Number(points[0].split(',')[0]) + 5},${points[0].split(',')[1]}`);
              points.push(`${Number(points[0].split(',')[0]) - 5},${points[0].split(',')[1]}`);
            }
            return (
              <polyline
                key={trace.entryId}
                className={`racesync-chart-line racesync-car-${teamClassFor(trace.teamName)}`}
                points={points.join(' ')}
              />
            );
          })}
        </svg>
        {/* Where the replay has got to, so a line that stops early reads as a
            race still running rather than one that ended. */}
        <span
          className="racesync-chart-now"
          style={{ left: `${((plotLap - 1) / (lastLap - 1 || 1)) * 100}%` }}
        />
      </div>
      <div className="racesync-chart-axis">
        <span>1</span>
        <span>Lap {plotLap}</span>
        <span>{lastLap}</span>
      </div>
    </div>
  );
}

// Who is on a chart, so a line can be matched to a car without hunting for a
// hue — the map's own colour ramp, dot and code together.
function ChartLegend({ traces }) {
  return (
    <ul className="racesync-chart-legend">
      {traces.map((trace) => (
        <li key={trace.entryId} className="racesync-chart-legend-item">
          <span
            className={`racesync-stage-legend-dot racesync-car-${teamClassFor(trace.teamName)}`}
            aria-hidden="true"
          />
          <span className="racesync-panel-code">{driverCode(trace.driverName)}</span>
        </li>
      ))}
    </ul>
  );
}

function RaceSyncGraphs({ sessionId, snapshot, race, workflow, children }) {
  const { scope } = useRaceSyncSelection();
  const { series, error } = useRaceSyncLapSeries(sessionId);
  const people = useRaceSyncPeople();

  const lap = snapshot?.lap ?? 0;
  const totalLaps = snapshot?.totalLaps ?? null;
  const leaderboard = useMemo(
    () => (Array.isArray(snapshot?.leaderboard) ? snapshot.leaderboard : []),
    [snapshot]
  );

  // The comparison every panel reads: the same view scope as the map, applied
  // to the same race. The series' own rows carry the driver and team names the
  // scope matches on, so the panels and the map can never disagree about who is
  // in view.
  const drivers = useMemo(
    () => (series?.drivers ?? []).filter((driver) => entryInScope(scope, driver)),
    [series, scope]
  );
  const raceState = useMemo(
    () => leaderboard.filter((entry) => entryInScope(scope, entry)),
    [leaderboard, scope]
  );

  const stops = useMemo(() => stopCounts(drivers, lap), [drivers, lap]);
  const pace = useMemo(() => paceRows(drivers, lap), [drivers, lap]);
  const stints = useMemo(
    () => drivers.map((driver) => ({ driver, segments: stintSegments(driver, lap) })),
    [drivers, lap]
  );
  const pitRows = useMemo(
    () => drivers.map((driver) => ({ driver, stops: pitStops(driver, lap) })),
    [drivers, lap]
  );
  const delta = useMemo(() => lapTraces(drivers, lap), [drivers, lap]);

  // The twin line compares the two quickest cars in the comparison — with a
  // pair scoped, that is exactly the pair that was picked.
  const twinDrivers = useMemo(() => {
    const quickest = pace.slice(0, 2).map((row) => row.entryId);
    return drivers.filter((driver) => quickest.includes(driver.entryId));
  }, [drivers, pace]);
  const twin = useMemo(() => lapTraces(twinDrivers, lap), [twinDrivers, lap]);

  // The driver the Driver Analysis card reads in depth: the scope's driver
  // when exactly one is in view, otherwise whoever leads at the playhead —
  // the position column's own last-played entry, falling back to the
  // leaderboard's order while the field is still on the grid.
  const focusEntry = useMemo(() => {
    if (drivers.length === 0) return null;
    if (drivers.length === 1) return drivers[0];
    const leaderAtLap = drivers.find((driver) => driver.position?.[lap - 1] === 1);
    if (leaderAtLap) return leaderAtLap;
    const first = raceState[0];
    return drivers.find((driver) => driver.entryId === first?.entryId) ?? drivers[0];
  }, [drivers, lap, raceState]);
  const summary = useMemo(() => driverSummary(focusEntry, drivers, lap), [focusEntry, drivers, lap]);
  const photoUrl = driverPhotoUrl(people.driverByName(focusEntry?.driverName));
  const teamLogo = people.teamByName(focusEntry?.teamName)?.logoUrl ?? null;
  // The driver's nation, when the record names one: the two-letter code the
  // /api/drivers list already carries — a quiet plate beside the name, not a
  // second flag drawing.
  const focusNation =
    people.driverByName(focusEntry?.driverName)?.countryCode?.toUpperCase() ?? null;

  if (!sessionId) return null;

  if (error) {
    return (
      <section className="racesync-panels" aria-label="Race analysis panels">
        {/* The map card still stands: the stage keeps its frame whether or not
            the lap series can be read. */}
        <div className="racesync-analysis-stage">{children}</div>
        <p className="racesync-panels-message">
          Lap data isn’t available for this session, so there is nothing to read here.
        </p>
      </section>
    );
  }

  if (!series) {
    return (
      <section className="racesync-panels" aria-label="Race analysis panels">
        <div className="racesync-analysis-stage">{children}</div>
        <p className="racesync-panels-message">Loading the race data…</p>
      </section>
    );
  }

  const quickest = pace.find((row) => row.best != null) ?? null;
  const slowest = [...pace].reverse().find((row) => row.best != null) ?? null;
  const spread = quickest && slowest ? slowest.best - quickest.best : null;
  const stopCount = pitRows.reduce((sum, row) => sum + row.stops.length, 0);
  const lapWidth = Math.max(lap, 1);

  // Best laps are a fraction of a second apart over a lap of about a minute and
  // a half, so a true-to-scale bar would be a row of identical bars. The bars
  // read the comparison instead: the quickest is full length and the slowest
  // sits at a bit over half, with every real number printed beside them.
  const barWidth = (row) => {
    if (row.gapToBest == null) return '0%';
    const offThePace = spread > 0 ? row.gapToBest / spread : 0;
    return `${100 - offThePace * 42}%`;
  };

  return (
    <section className="racesync-panels" aria-label="Race analysis panels">
      <div className="racesync-analysis-grid">
        <Panel
          title="Race State"
          caption={lap > 0 ? `Lap ${lap}` : 'Starting grid'}
          slot="left-top"
        >
          {raceState.length === 0 ? (
            <p className="racesync-panel-empty">No drivers to show.</p>
          ) : (
            <div className="racesync-panel-scroll">
              <table className="racesync-table">
                <thead>
                  <tr>
                    <th scope="col" className="racesync-table-pos">
                      Pos
                    </th>
                    <th scope="col">Driver</th>
                    <th scope="col" className="racesync-table-num">
                      Int
                    </th>
                    <th scope="col" className="racesync-table-num">
                      Tyre
                    </th>
                    <th scope="col" className="racesync-table-num">
                      Last lap
                    </th>
                    <th scope="col" className="racesync-table-num">
                      Stops
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {raceState.map((entry) => (
                    <tr key={entry.entryId}>
                      <td className="racesync-table-pos">{entry.position ?? '—'}</td>
                      <td className="racesync-table-driver">
                        <DriverTag driverName={entry.driverName} teamName={entry.teamName} />
                      </td>
                      <td className="racesync-table-num">
                        {entry.gapToAhead != null ? formatGap(entry.gapToAhead) : '—'}
                      </td>
                      <td className="racesync-table-num">
                        <TyreChip compound={entry.tyreCompound} />
                      </td>
                      <td className="racesync-table-num">
                        {/* At the flag the classification's own status stands in
                            for a car that never set a last lap. */}
                        {entry.lastLapTime != null ? (
                          formatLapTime(entry.lastLapTime)
                        ) : entry.status && entry.status !== 'finished' ? (
                          <span className="racesync-table-status">{entry.status}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="racesync-table-num">{stops.get(entry.entryId) ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          title="Pace & Key Metrics"
          caption={`${pace.length} in view`}
          slot="left-bottom"
        >
          {lap === 0 ? (
            <NoLaps />
          ) : (
            <>
              <dl className="racesync-metrics">
                <div className="racesync-metric">
                  <dt>Fastest lap</dt>
                  <dd>
                    {formatLapTime(quickest?.best)}
                    {quickest && (
                      <span className="racesync-metric-note">{driverCode(quickest.driverName)}</span>
                    )}
                  </dd>
                </div>
                <div className="racesync-metric">
                  <dt>Pace spread</dt>
                  <dd>
                    {spread != null ? `${formatGap(spread)}s` : '—'}
                    <span className="racesync-metric-note">best to slowest</span>
                  </dd>
                </div>
                <div className="racesync-metric">
                  <dt>Pit stops</dt>
                  <dd>
                    {stopCount}
                    <span className="racesync-metric-note">in view</span>
                  </dd>
                </div>
                <div className="racesync-metric">
                  <dt>Laps run</dt>
                  <dd>
                    {lap}
                    {totalLaps != null && <span className="racesync-metric-note">of {totalLaps}</span>}
                  </dd>
                </div>
              </dl>

              <ul className="racesync-pace racesync-panel-scroll">
                {pace.map((row) => (
                  <li key={row.entryId} className="racesync-pace-row">
                    <span className="racesync-panel-code">{driverCode(row.driverName)}</span>
                    <span className="racesync-pace-track">
                      <span
                        className={`racesync-pace-bar racesync-car-${teamClassFor(row.teamName)}`}
                        style={{ width: barWidth(row) }}
                      />
                    </span>
                    <span className="racesync-pace-value">
                      {row.best != null ? formatLapTime(row.best) : '—'}
                    </span>
                    <span className="racesync-pace-gap">
                      {row.gapToBest ? formatDelta(row.gapToBest) : ''}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="racesync-panel-note">
                Best lap per driver, with the spread between the comparison’s quickest and
                slowest best laps setting the bar lengths.
              </p>
            </>
          )}
        </Panel>

        {/* The map card, standing between the two flanking columns: two
            readings down its left, two down its right — all four following the
            same playhead as the map — with the charts across the width under
            both. The stage's own card, handed to the readings' grid. */}
        <div className="racesync-analysis-stage">{children}</div>

        <Panel
          title="Tyre Stints"
          caption={lap > 0 ? `Lap ${lap}` : null}
          slot="right-top"
          anchor={SECTION_ANCHORS.strategy}
        >
          {lap === 0 ? (
            <NoLaps />
          ) : (
            <ul className="racesync-stints racesync-panel-scroll">
              {stints.map(({ driver, segments }) => {
                const current = segments.at(-1);
                return (
                  <li key={driver.entryId} className="racesync-stint-row">
                    <span className="racesync-panel-code">{driverCode(driver.driverName)}</span>
                    <span className="racesync-stint-track">
                      {segments.map((segment) => {
                        const chip = compoundChip(segment.compound);
                        return (
                          <span
                            key={segment.fromLap}
                            className={`racesync-stint-bar racesync-tyre-${chip?.key ?? 'other'}`}
                            style={{ width: `${(segment.laps / lapWidth) * 100}%` }}
                            title={`${chip?.label ?? 'Compound not logged'} · laps ${segment.fromLap}–${segment.toLap}`}
                          >
                            <span className="racesync-stint-letter">{chip?.letter ?? '?'}</span>
                            <span className="racesync-stint-laps">{segment.laps}</span>
                          </span>
                        );
                      })}
                    </span>
                    <span className="racesync-stint-age">
                      {current.laps} {current.laps === 1 ? 'lap' : 'laps'}
                      {/* Measured off the stint's own lap times, so a stint too
                          short to have two halves shows no trend at all. */}
                      {current.wearPerLap != null && (
                        <span className="racesync-stint-wear">
                          {formatDelta(current.wearPerLap)}/lap
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          title="Pit Stops"
          caption={stopCount > 0 ? `${stopCount} stops` : null}
          slot="right-bottom"
        >
          {lap === 0 ? (
            <NoLaps />
          ) : stopCount === 0 ? (
            <p className="racesync-panel-empty">No stops yet.</p>
          ) : (
            <>
              <ul className="racesync-stops racesync-panel-scroll">
                {pitRows.flatMap(({ driver, stops: driverStops }) =>
                  driverStops.map((stop) => (
                    <li key={`${driver.entryId}-${stop.lap}`} className="racesync-stop">
                      <span className="racesync-panel-code">{driverCode(driver.driverName)}</span>
                      <span className="racesync-stop-lap">L{stop.lap}</span>
                      <span className="racesync-stop-tyres">
                        <TyreChip compound={stop.from} />
                        <span className="racesync-stop-arrow" aria-hidden="true">
                          ›
                        </span>
                        <TyreChip compound={stop.to} />
                      </span>
                      {/* The change across the stop, not a claim about what
                          caused it: the cars around a pit lane move too. */}
                      <span
                        className={`racesync-stop-places${
                          stop.places > 0 ? ' is-gain' : stop.places < 0 ? ' is-loss' : ''
                        }`}
                        title={
                          stop.positionBefore != null && stop.positionAfter != null
                            ? `P${stop.positionBefore} before the stop, P${stop.positionAfter} after`
                            : undefined
                        }
                      >
                        {stop.places == null
                          ? '—'
                          : stop.places === 0
                          ? '±0'
                          : `${stop.places > 0 ? '+' : '-'}${Math.abs(stop.places)}`}
                      </span>
                    </li>
                  ))
                )}
              </ul>
              <p className="racesync-panel-note">
                One row per stop, on the first lap its new set is on — with the places
                gained over it.
              </p>
            </>
          )}
        </Panel>

        {/* The focused driver, read in depth down the grid's right-hand
            rail: who they are — introduced by the app's own driver and team
            records, so the photo and the badge are the same assets the driver
            and team pages serve — and the summary the synced data honestly
            supports. The strategy recommendation the mockup draws has no
            simulation behind it and says so instead of inventing one. */}
        <Panel
          title="Driver Analysis"
          caption={drivers.length === 1 ? 'in scope' : lap > 0 ? 'race leader' : 'starting grid'}
          rail
          anchor={SECTION_ANCHORS.driverAnalysis}
        >
          {focusEntry == null ? (
            <p className="racesync-panel-empty">No drivers in view.</p>
          ) : (
            <div className="racesync-driver">
              <div className="racesync-driver-id">
                {photoUrl ? (
                  <img
                    className="racesync-driver-photo"
                    src={photoUrl}
                    alt={displayName(focusEntry.driverName)}
                  />
                ) : (
                  // No record or no photo: the team-coloured plate the map
                  // marks the car with, never a wrong or broken face.
                  <span
                    className={`racesync-driver-photo is-fallback racesync-car-${teamClassFor(
                      focusEntry.teamName
                    )}`}
                    aria-hidden="true"
                  >
                    {driverCode(focusEntry.driverName)}
                  </span>
                )}
                <div className="racesync-driver-id-text">
                  <div className="racesync-driver-name-row">
                    <h4 className="racesync-driver-name">{displayName(focusEntry.driverName)}</h4>
                    {focusNation && (
                      <span className="racesync-driver-nation">{focusNation}</span>
                    )}
                  </div>
                  <p className="racesync-driver-team">
                    {teamLogo ? (
                      <img className="racesync-driver-logo" src={teamLogo} alt={focusEntry.teamName} />
                    ) : (
                      <span
                        className={`racesync-stage-legend-dot racesync-car-${teamClassFor(
                          focusEntry.teamName
                        )}`}
                        aria-hidden="true"
                      />
                    )}
                    {focusEntry.teamName}
                  </p>
                </div>
              </div>

              {summary != null && summary.laps > 0 ? (
                <>
                  <dl className="racesync-metrics racesync-driver-metrics">
                    <div className="racesync-metric">
                      <dt>Avg pace</dt>
                      <dd>
                        {formatLapTime(summary.average)}
                        {summary.averageGap != null && (
                          <span className="racesync-metric-note">
                            {formatDelta(summary.averageGap)} to best avg
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="racesync-metric">
                      <dt>Best lap</dt>
                      <dd>
                        {formatLapTime(summary.best)}
                        {summary.bestLap != null && (
                          <span className="racesync-metric-note">Lap {summary.bestLap}</span>
                        )}
                      </dd>
                    </div>
                    <div className="racesync-metric">
                      <dt>Tyre degradation</dt>
                      <dd>
                        {summary.degradation != null ? `${summary.degradation.toFixed(2)}% / lap` : '—'}
                        <span className="racesync-metric-note">
                          {summary.degradation != null ? 'latest stint' : 'needs a longer stint'}
                        </span>
                      </dd>
                    </div>
                    <div className="racesync-metric">
                      <dt>Stint lengths</dt>
                      <dd>
                        {summary.stintLengths.length > 0 ? summary.stintLengths.join(' / ') : '—'}
                        <span className="racesync-metric-note">
                          {summary.stopCount} {summary.stopCount === 1 ? 'stop' : 'stops'}
                        </span>
                      </dd>
                    </div>
                  </dl>

                  {summary.takeaways.length > 0 && (
                    <ul className="racesync-driver-takeaways">
                      {summary.takeaways.map((takeaway) => (
                        <li key={takeaway}>{takeaway}</li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <NoLaps />
              )}

              {/* The recommendation block the design draws, honest rather
                  than present: no alternate strategy can be computed from one
                  race that already happened, so the row names that and the
                  button stays out — the same rule as the spine's Simulate. */}
              <div className="racesync-driver-strategy">
                <span className="racesync-driver-strategy-label">Recommended strategy</span>
                <span className="racesync-driver-strategy-hint">no simulation data</span>
                <button
                  type="button"
                  className="racesync-driver-sim"
                  disabled
                  aria-disabled="true"
                  title="Nothing on this page simulates alternate strategies — the synced data is one race that already happened"
                >
                  Run Simulation
                </button>
              </div>
            </div>
          )}
        </Panel>

        {/* The workflow spine takes the full-width row under the readings —
            the three phases lead on the left, and every control that drives
            the playhead sits on it beside the replay mark. */}
        {workflow}

        {/* The caption stands where it stood when the readings were a row of
            panels under the map: between the map's band and the readings that
            follow it. The readings now flank the map, so its line falls
            between the reading band and the two lap charts — the one place it
            can stand without taking the line the map needs, hard under the
            race band. The export beside the scope says what it cuts: the same
            laps, the same drivers, the same playhead as the panels under it. */}
        <header className="racesync-panels-head">
          <h3 className="racesync-panels-title">Race analysis</h3>
          <div className="racesync-panels-tools">
            <span className="racesync-panels-scope">
              {isScopeActive(scope) ? scopeLabel(scope) : 'Whole field'}
            </span>
            <button
              type="button"
              className="racesync-panels-export"
              title="Every lap the playhead has passed, for the drivers in view, as a CSV file"
              onClick={() =>
                downloadCsv(
                  readingsCsvFilename(race?.meetingName, lap),
                  readingsCsv(drivers, lap)
                )
              }
              disabled={lap === 0}
            >
              Export CSV
            </button>
          </div>
        </header>

        <Panel
          title="Lap Time Delta"
          caption={delta.reference != null ? `Quickest ${formatLapTime(delta.reference)}` : null}
          anchor={SECTION_ANCHORS.lapTime}
          wide
        >
          {lap === 0 ? (
            <NoLaps />
          ) : (
            <>
              <LapChart
                traces={delta.traces}
                reference={delta.reference}
                mode="delta"
                uptoLap={lap}
                totalLaps={totalLaps}
                label="Lap time delta"
              />
              <ChartLegend traces={delta.traces} />
              <p className="racesync-panel-note">
                One line per driver in view, each lap measured against the quickest lap in
                this comparison. Corner-level braking and traction aren’t in the synced data
                for any session, so the laps themselves are the breakdown — a spike is a slow
                lap, and the stops above are where the spikes are.{' '}
                {stoppageNote(delta.stoppageLaps)}
              </p>
            </>
          )}
        </Panel>

        <Panel
          title="Twin Line"
          caption={
            twinDrivers.length === 2
              ? twinDrivers.map((driver) => driverCode(driver.driverName)).join(' vs ')
              : null
          }
          anchor={SECTION_ANCHORS.comparison}
          wide
        >
          {lap === 0 ? (
            <NoLaps />
          ) : twinDrivers.length < 2 ? (
            <p className="racesync-panel-empty">
              Two drivers are needed for a two-line reading — scope a pair on the map above.
            </p>
          ) : (
            <>
              <div className="racesync-twin">
                {twin.traces.map((trace) => (
                  <div key={trace.entryId} className="racesync-twin-card">
                    <DriverTag driverName={trace.driverName} teamName={trace.teamName} />
                    <span className="racesync-twin-value">{formatLapTime(trace.best)}</span>
                    <span className="racesync-twin-meta">
                      best · {trace.points.length} {trace.points.length === 1 ? 'lap' : 'laps'}
                    </span>
                  </div>
                ))}
              </div>
              <LapChart
                traces={twin.traces}
                reference={twin.reference}
                mode="pace"
                uptoLap={lap}
                totalLaps={totalLaps}
                label="Lap times"
              />
              <p className="racesync-panel-note">
                Lap times, not telemetry: no speed, brake, gear or DRS channels are synced
                for these sessions, so two drivers’ laps are the twin reading this data can
                honestly draw.{' '}
                {stoppageNote(twin.stoppageLaps)}
              </p>
            </>
          )}
        </Panel>
      </div>
    </section>
  );
}

export default RaceSyncGraphs;
