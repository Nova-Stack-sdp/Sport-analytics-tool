import { useMemo, useState } from 'react';
// Read-only reuse of Race Replay's team-name → palette-key mapper, so a line on
// a chart carries the same colour as that team's marker on the map above it.
import { teamClassFor } from '../race-replay/raceReplayHelpers';
import { useRaceSyncSelection } from './RaceSyncSelection';
import { useRaceSyncSim } from './RaceSyncSimContext';
import { DEFAULT_TWEAK, pitCallAtLap, simSummaryAtLap, stopLapBounds } from './raceSyncSim';
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
// replay series (fetched once in RaceSyncSimContext, which this file reads)
// and all following the same two
// things the map follows: the view scope in the header, and the playhead. A
// panel never shows a lap the replay hasn't reached. (How each reading is
// derived lives beside this file, in raceSyncReadings — the same split the map
// and the view scope already use.)
//
// The sim console sits under the spine whenever a race is picked; the sim
// readings — the pit-window briefing, the two sim charts and the broadcast
// line — draw only in sim mode with a tweak live, and everything they show comes from raceSyncSim, the delta
// model beside raceSyncReadings: the real laps re-priced for tyre age and
// the pit loss, never invented telemetry. The lap series and the sim are
// read from the shared sim surface (see RaceSyncSimContext) — one fetch, one
// sim for the stage, the panels and the spine together.
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

function LapChart({ traces, reference, mode, uptoLap, totalLaps, label, domain: domainOverride, zeroLine = false }) {
  // The sim charts pass a domain of their own (see the two panels below);
  // every other chart lets raceSyncReadings measure the band.
  const domain = domainOverride ?? chartDomain({ traces, reference, mode });
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
          {/* A delta chart's honest midpoint: above the line is slower than
              the real race, below is quicker. */}
          {zeroLine && domain.min < 0 && domain.max > 0 && (
            <line
              className="racesync-chart-zero"
              x1="0"
              x2={CHART_WIDTH}
              y1={scaleY(0)}
              y2={scaleY(0)}
            />
          )}
          {traces.map((trace) => {
            const toPoints = (list) =>
              list.map(
                (point) =>
                  `${scaleX(point.lap)},${scaleY(plottedValue(point, { mode, reference }))}`
              );
            const points = toPoints(trace.points);
            // The ghost of the real race under a sim line: same driver, same
            // team colour, drawn first so the solid sim line rides on top.
            const ghostPoints = trace.ghostPoints ? toPoints(trace.ghostPoints) : null;
            if (points.length === 0 && (!ghostPoints || ghostPoints.length === 0)) return null;
            // One lap is not a line: an opening lap gets a short flat mark so
            // the race's first lap is visible at all.
            if (points.length === 1) {
              points.push(`${Number(points[0].split(',')[0]) + 5},${points[0].split(',')[1]}`);
              points.push(`${Number(points[0].split(',')[0]) - 5},${points[0].split(',')[1]}`);
            }
            return (
              <g key={trace.entryId}>
                {ghostPoints && ghostPoints.length > 0 && (
                  <polyline
                    className={`racesync-chart-line is-ghost racesync-car-${teamClassFor(
                      trace.teamName
                    )}`}
                    points={ghostPoints.join(' ')}
                  />
                )}
                {points.length > 0 && (
                  <polyline
                    className={`racesync-chart-line racesync-car-${teamClassFor(trace.teamName)}`}
                    points={points.join(' ')}
                  />
                )}
              </g>
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

// The pace dial's readout: "+0.15s/lap" eases off, "-0.15s/lap" finds time,
// and zero says exactly what it means — the real race's pace.
function paceDeltaLabel(value) {
  if (!Number.isFinite(value) || value === 0) return 'race pace';
  return `${value < 0 ? '-' : '+'}${Math.abs(value).toFixed(2)}s/lap`;
}

// The briefing under the sim console: the pit window each tweaked driver
// still has to take, beside what the change has cost so far. It follows the
// playhead like every other reading, folds away when the reader wants the
// console's full height, and fades once every tweaked car has taken its
// last stop — the window has closed, and the card says so by stepping back
// instead of leaving the page.
function SimBriefing({ sim, driversById, lap }) {
  const [open, setOpen] = useState(true);
  const rows = sim.tweaked
    .map((entryId) => simSummaryAtLap(sim, entryId, driversById, lap))
    .filter(Boolean);
  if (rows.length === 0) return null;
  const windowOpen = rows.some((row) => row.nextStop != null);
  return (
    <div className={`racesync-briefing${windowOpen ? '' : ' is-dim'}`}>
      <button
        type="button"
        className="racesync-briefing-head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="racesync-briefing-title">Pit window</span>
        <span className="racesync-briefing-chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <ul className="racesync-briefing-list">
          {rows.map((row) => {
            // The row lights in the pit call's colour while a call is live
            // (see RaceSyncPitCall), keyed by the moment so it blinks once
            // as the moment begins.
            const call = pitCallAtLap(sim, row.entryId, lap);
            return (
              <li
                key={call ? `${row.entryId}:${call.kind}:${call.stopLap}` : row.entryId}
                className={`racesync-briefing-row${call ? ` is-call is-${call.tone}` : ''}`}
              >
                <span
                  className={`racesync-briefing-driver racesync-team-text racesync-car-${teamClassFor(
                    row.teamName
                  )}`}
                >
                  {driverCode(row.driverName)}
                </span>
                <span className="racesync-briefing-stop">
                  {row.nextStop != null ? (
                    <>
                      Next stop <strong>L{row.nextStop}</strong>
                      {row.nextStopDelta != null && row.nextStopDelta !== 0 && (
                        <span className="racesync-briefing-shift">
                          {' '}
                          ({Math.abs(row.nextStopDelta)}{' '}
                          {row.nextStopDelta < 0 ? 'earlier' : 'later'} than the real race)
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="racesync-briefing-done">All stops taken</span>
                  )}
                </span>
                {row.raceDelta != null && (
                  <span
                    className={`racesync-briefing-delta${
                      row.raceDelta > 0 ? ' is-loss' : row.raceDelta < 0 ? ' is-gain' : ''
                    }`}
                  >
                    {formatDelta(row.raceDelta)}s
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// The sim console: one bar directly under the workflow spine, always on
// screen once a race is picked, so the levers are never something to go
// looking for. Left to right it reads as the question it answers — WHO
// (a chip per car in view, tweaked cars marked), WHAT (the pit stepper and
// the pace slider for that car) — and the pit-window briefing hangs under
// it once anything is tweaked. Touching a lever enters sim mode (the
// context does that), so in replay the bar simply invites the first move.
// The stop readout shows the ACTUAL laps the shift produced (clamped by the
// race), with the real race's laps beside it for reference.
function SimConsole({ drivers, defaultEntryId, lap, driversById }) {
  const {
    mode,
    sim,
    simLive,
    tweaks,
    updateTweak,
    resetTweak,
    resetAllTweaks,
    simTarget,
    setSimTarget,
  } = useRaceSyncSim();

  // Running order at the playhead, so the chips read like the timing tower.
  const ordered = useMemo(() => {
    const at = (driver) => driver.position?.[lap - 1] ?? Number.POSITIVE_INFINITY;
    return [...drivers].sort((a, b) => at(a) - at(b));
  }, [drivers, lap]);

  // Who the levers act on: the picked car while it is in view, else the
  // first tweaked car in view, else the card's own focus driver.
  const inView = (entryId) => ordered.some((driver) => driver.entryId === entryId);
  const targetId = inView(simTarget)
    ? simTarget
    : ordered.find((driver) => tweaks[driver.entryId])?.entryId ??
      (inView(defaultEntryId) ? defaultEntryId : ordered[0]?.entryId ?? null);
  const target = ordered.find((driver) => driver.entryId === targetId) ?? null;
  const targetSim = target && sim ? sim.drivers.get(target.entryId) ?? null : null;
  const tweak = tweaks[targetId] ?? DEFAULT_TWEAK;
  const paceDelta = tweak.paceDelta ?? 0;
  const anyTweaked = Object.keys(tweaks).length > 0;

  // Move one stop a lap, the others holding. The new shift is written from
  // the lap the stop ACTUALLY lands on, so pressing past an edge never piles
  // up a shift the race can't honour — and the buttons stop at the edge too.
  const moveStop = (index, step) => {
    const base = targetSim.baseStopLaps[index];
    const { min, max } = stopLapBounds(targetSim.newStopLaps, index, sim.totalLaps);
    const lap = Math.min(Math.max(targetSim.newStopLaps[index] + step, min), max);
    const stopShifts = targetSim.baseStopLaps.map(
      (_, i) => (i === index ? lap - base : targetSim.newStopLaps[i] - targetSim.baseStopLaps[i])
    );
    updateTweak(target.entryId, { pitShift: 0, stopShifts });
  };

  return (
    <section
      id={SECTION_ANCHORS.simConsole}
      className={`racesync-console${mode === 'sim' ? ' is-sim' : ''}`}
      aria-label="Simulation console"
    >
      <div className="racesync-console-head">
        <span className="racesync-console-title">Simulate</span>
        <span className="racesync-console-hint">
          {simLive
            ? 'The map, charts and timing now show the re-run race.'
            : 'Pick a car, then move its pit stop or pace — the race re-runs instantly.'}
        </span>
        {anyTweaked && (
          <button type="button" className="racesync-sim-reset" onClick={resetAllTweaks}>
            Reset all
          </button>
        )}
      </div>

      {ordered.length === 0 ? (
        <p className="racesync-panel-empty">No drivers in view.</p>
      ) : (
        <>
          <div className="racesync-console-cars" role="radiogroup" aria-label="Car to simulate">
            {ordered.map((driver) => {
              const picked = driver.entryId === targetId;
              const tweaked = Boolean(tweaks[driver.entryId]);
              return (
                <button
                  key={driver.entryId}
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  className={`racesync-console-car${picked ? ' is-picked' : ''}${
                    tweaked ? ' is-tweaked' : ''
                  }`}
                  title={`${displayName(driver.driverName)}${tweaked ? ' — tweaked' : ''}`}
                  onClick={() => setSimTarget(driver.entryId)}
                >
                  <span
                    className={`racesync-stage-legend-dot racesync-car-${teamClassFor(
                      driver.teamName
                    )}`}
                    aria-hidden="true"
                  />
                  {driverCode(driver.driverName)}
                </button>
              );
            })}
          </div>

          {targetSim ? (
            <div className="racesync-console-levers">
              {/* One stepper per real stop, so a two-stopper's first stop
                  can come early while the second holds. */}
              <div className="racesync-console-lever">
                <span className="racesync-sim-label">
                  {driverCode(target.driverName)}{' '}
                  {targetSim.baseStopLaps.length > 1 ? 'pit stops' : 'pit stop'}
                </span>
                {targetSim.baseStopLaps.length === 0 ? (
                  <span className="racesync-sim-note">No stops in the real race to move</span>
                ) : (
                  <ol className="racesync-console-stops">
                    {targetSim.newStopLaps.map((stopLap, index) => {
                      const base = targetSim.baseStopLaps[index];
                      const shift = stopLap - base;
                      const { min, max } = stopLapBounds(
                        targetSim.newStopLaps,
                        index,
                        sim.totalLaps
                      );
                      const name = targetSim.baseStopLaps.length > 1 ? `stop ${index + 1}` : 'the stop';
                      return (
                        <li key={index} className="racesync-console-stop">
                          {targetSim.baseStopLaps.length > 1 && (
                            <span className="racesync-console-stop-num">{index + 1}</span>
                          )}
                          <div className="racesync-sim-stepper">
                            <button
                              type="button"
                              className="racesync-sim-stepper-btn"
                              title={`Move ${name} one lap earlier`}
                              aria-label={`Move ${name} earlier`}
                              onClick={() => moveStop(index, -1)}
                              disabled={stopLap <= min}
                            >
                              −
                            </button>
                            <span className="racesync-sim-pit-laps">L{stopLap}</span>
                            <button
                              type="button"
                              className="racesync-sim-stepper-btn"
                              title={`Move ${name} one lap later`}
                              aria-label={`Move ${name} later`}
                              onClick={() => moveStop(index, 1)}
                              disabled={stopLap >= max}
                            >
                              +
                            </button>
                          </div>
                          <span className="racesync-sim-note">
                            {shift === 0
                              ? 'as raced'
                              : `${Math.abs(shift)} ${Math.abs(shift) === 1 ? 'lap' : 'laps'} ${
                                  shift < 0 ? 'earlier' : 'later'
                                } · real L${base}`}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>

              <div className="racesync-console-lever is-pace">
                <span className="racesync-sim-label">{driverCode(target.driverName)} pace</span>
                <div className="racesync-sim-pace">
                  <span className="racesync-sim-pace-end">Faster</span>
                  <input
                    type="range"
                    className="racesync-sim-pace-slider"
                    min="-0.5"
                    max="0.5"
                    step="0.05"
                    value={paceDelta}
                    aria-label="Pace change per lap"
                    aria-valuetext={paceDeltaLabel(paceDelta)}
                    onChange={(event) =>
                      updateTweak(target.entryId, { paceDelta: Number(event.target.value) })
                    }
                  />
                  <span className="racesync-sim-pace-end">Slower</span>
                </div>
                <span className="racesync-sim-note">{paceDeltaLabel(paceDelta)}</span>
              </div>

              {tweaks[target.entryId] && (
                <button
                  type="button"
                  className="racesync-sim-reset"
                  onClick={() => resetTweak(target.entryId)}
                >
                  Reset {driverCode(target.driverName)}
                </button>
              )}
            </div>
          ) : (
            <p className="racesync-driver-strategy-hint">
              No lap data to simulate for this driver.
            </p>
          )}
        </>
      )}

      {simLive && sim && <SimBriefing sim={sim} driversById={driversById} lap={lap} />}
    </section>
  );
}

// The broadcast sentence under the spine: what was changed, what it has
// cost, who it moved. Numbers carry the weight (bold), drivers carry their
// team colours, and the clause order is cause → effect — the same order
// the sim computes them.
function SimBroadcast({ sim, driversById, lap }) {
  const rows = sim.tweaked
    .map((entryId) => simSummaryAtLap(sim, entryId, driversById, lap))
    .filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <div className="racesync-broadcast" aria-live="polite">
      {rows.map((row) => (
        <p key={row.entryId} className="racesync-broadcast-line">
          <span
            className={`racesync-broadcast-driver racesync-team-text racesync-car-${teamClassFor(
              row.teamName
            )}`}
          >
            {driverCode(row.driverName)}
          </span>{' '}
          <SimCause row={row} />
          {row.swing && (
            <>
              {' '}and{' '}
              <strong>
                {row.swing.places > 0
                  ? `gained ${row.swing.places}`
                  : `lost ${Math.abs(row.swing.places)}`}
              </strong>{' '}
              {Math.abs(row.swing.places) === 1 ? 'place' : 'places'} on lap{' '}
              <strong>{row.swing.lap}</strong>
              {row.swing.tradedName && (
                <>
                  {' '}to{' '}
                  <span
                    className={`racesync-broadcast-driver racesync-team-text racesync-car-${teamClassFor(
                      row.swing.tradedTeam
                    )}`}
                  >
                    {driverCode(row.swing.tradedName)}
                  </span>
                </>
              )}
            </>
          )}
          {row.raceDelta != null && (
            <>
              {' '}— net <strong>{formatDelta(row.raceDelta)}s</strong>
            </>
          )}
          {row.nextStop != null && (
            <>
              {', '}next stop <strong>L{row.nextStop}</strong>
            </>
          )}
          .
        </p>
      ))}
    </div>
  );
}

// The cause clause of the broadcast sentence, from what the sim actually
// applied: each stop's real movement (clamped by the race — the
// sentence reports what happened, not what was asked for) and the pace dial.
function SimCause({ row }) {
  const parts = [];
  const deltas = row.stopDeltas ?? [];
  deltas.forEach((delta, index) => {
    if (!delta) return;
    const laps = `${Math.abs(delta)} ${Math.abs(delta) === 1 ? 'lap' : 'laps'}`;
    // A one-stopper "stopped 2 laps early"; a multi-stopper names the stop.
    parts.push(
      deltas.length > 1
        ? `took stop ${index + 1} ${laps} ${delta < 0 ? 'early' : 'late'}`
        : `stopped ${laps} ${delta < 0 ? 'early' : 'late'}`
    );
  });
  if (row.paceDelta !== 0) {
    parts.push(
      row.paceDelta < 0
        ? `found ${Math.abs(row.paceDelta).toFixed(2)}s a lap`
        : `eased off ${Math.abs(row.paceDelta).toFixed(2)}s a lap`
    );
  }
  return <>{parts.length > 0 ? parts.join(' and ') : 'changed strategy'}</>;
}

function RaceSyncGraphs({ sessionId, snapshot, race, workflow, children }) {
  const { scope } = useRaceSyncSelection();
  // The lap series and the sim both come from the shared surface: one fetch,
  // one sim, so the panels, the stage and the spine can never disagree about
  // what the race was or what a change did. (The panels used to own this
  // fetch; it moved up into RaceSyncSimContext with the sim.)
  const {
    series,
    seriesError: error,
    sim,
    simLive,
  } = useRaceSyncSim();
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

  // Every series driver keyed by entryId, for naming the car a position was
  // traded with in the briefing and the broadcast line.
  const driversById = useMemo(
    () => new Map((series?.drivers ?? []).map((driver) => [driver.entryId, driver])),
    [series]
  );

  // The sim's two charts, cut at the playhead like every other reading. The
  // gap chart keeps the real race alongside as a ghost trace under each sim
  // line; the delta chart is the tweaked drivers' cumulative gain or loss
  // against their own logged race.
  const simGapTraces = useMemo(() => {
    if (!simLive || !sim || lap < 1) return null;
    const cut = Math.min(lap, sim.totalLaps);
    const traces = drivers
      .map((driver) => {
        const simGap = sim.simGapToLeader.get(driver.entryId);
        const baseGap = sim.baseGapToLeader.get(driver.entryId);
        if (!simGap && !baseGap) return null;
        const toPoints = (array) => {
          const points = [];
          for (let l = 1; l <= cut; l += 1) {
            const value = array?.[l - 1];
            if (Number.isFinite(value)) points.push({ lap: l, seconds: value });
          }
          return points;
        };
        return {
          entryId: driver.entryId,
          driverName: driver.driverName,
          teamName: driver.teamName,
          points: toPoints(simGap),
          ghostPoints: toPoints(baseGap),
        };
      })
      .filter(Boolean);
    return traces.length > 0 ? traces : null;
  }, [simLive, sim, drivers, lap]);

  const simDeltaTraces = useMemo(() => {
    if (!simLive || !sim || lap < 1) return null;
    const cut = Math.min(lap, sim.totalLaps);
    const traces = sim.tweaked
      .map((entryId) => {
        const driver = sim.drivers.get(entryId);
        if (!driver) return null;
        const points = [];
        for (let l = 1; l <= cut; l += 1) {
          const value = driver.deltaVsBaseline[l - 1];
          if (Number.isFinite(value)) points.push({ lap: l, seconds: value });
        }
        if (points.length === 0) return null;
        return {
          entryId: driver.entryId,
          driverName: driver.driverName,
          teamName: driver.teamName,
          points,
        };
      })
      .filter(Boolean);
    return traces.length > 0 ? traces : null;
  }, [simLive, sim, lap]);

  // Domains the sim charts have to force. The gap chart covers ghost and
  // solid traces together (the baseline can sit above the sim early in a
  // stint), and the delta chart is symmetric about its zero line so a gain
  // and a loss read at the same weight.
  const simGapDomain = useMemo(() => {
    if (!simGapTraces) return null;
    const values = simGapTraces.flatMap((trace) =>
      [...trace.points, ...trace.ghostPoints].map((point) => point.seconds)
    );
    if (values.length === 0) return null;
    const low = Math.min(...values);
    const high = Math.max(...values);
    const pad = (high - low || 1) * 0.12;
    return { min: Math.max(0, low - pad), max: high + pad };
  }, [simGapTraces]);

  const simDeltaDomain = useMemo(() => {
    if (!simDeltaTraces) return null;
    const values = simDeltaTraces.flatMap((trace) => trace.points.map((point) => point.seconds));
    if (values.length === 0) return null;
    const extent = Math.max(Math.abs(Math.min(...values)), Math.abs(Math.max(...values)), 0.5);
    return { min: -extent * 1.15, max: extent * 1.15 };
  }, [simDeltaTraces]);

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
            supports, closing on a link down to the sim console. */}
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

              {/* The levers moved to the sim console under the spine; the
                  card points there so a reader who looks here still finds
                  them in one click. */}
              <a className="racesync-driver-sim-link" href={`#${SECTION_ANCHORS.simConsole}`}>
                What if {driverCode(focusEntry.driverName)} pitted differently? Simulate ↓
              </a>
            </div>
          )}
        </Panel>

        {/* The workflow spine takes the full-width row under the readings —
            the three phases lead on the left, and every control that drives
            the playhead sits on it beside the replay mark. The sim console
            rides directly under it, always visible, so the levers sit beside
            the Replay/Sim switch instead of inside a card. The broadcast line
            follows: one sentence per tweaked driver, saying what the change
            is doing at the playhead — cause first, then the cost, then who
            it moved. One block, so the grid places all three as one row. */}
        <div className="racesync-spine-block">
          {workflow}
          {workflow && (
            <SimConsole
              drivers={drivers}
              defaultEntryId={focusEntry?.entryId ?? null}
              lap={lap}
              driversById={driversById}
            />
          )}
          {simLive && sim && <SimBroadcast sim={sim} driversById={driversById} lap={lap} />}
        </div>

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

        {/* The two lap charts read as a pair: side by side on one full-width
            row, each taking half — they fall under each other only once a
            half stops being wide enough to read a lap chart. */}
        <div className="racesync-chart-pair">
          <Panel
            title="Lap Time Delta"
            caption={delta.reference != null ? `Quickest ${formatLapTime(delta.reference)}` : null}
            anchor={SECTION_ANCHORS.lapTime}
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

        {/* The sim's two charts, drawn only while a sim is live and paired
            side by side like the lap charts above. The gap chart holds the
            real race alongside as a ghost trace — the baseline is the
            comparison, never deleted — and the delta chart is symmetric
            about zero so a gain and a loss read at the same weight. */}
        {simLive && (
          <div className="racesync-chart-pair">
            {simGapTraces && simGapDomain && (
              <Panel title="Simulated Gap to Leader" caption="solid sim · ghost real">
                <LapChart
                  traces={simGapTraces}
                  mode="pace"
                  uptoLap={lap}
                  totalLaps={totalLaps}
                  label="Simulated gap to leader"
                  domain={simGapDomain}
                />
                <ChartLegend traces={simGapTraces} />
                <p className="racesync-panel-note">
                  Solid lines are the sim; the ghosted line under each is the same
                  driver’s real race. The sim re-prices tyre age and the pit loss —
                  everything else in the log is left exactly as it happened.
                </p>
              </Panel>
            )}

            {simDeltaTraces && simDeltaDomain && (
              <Panel title="Cumulative Delta" caption="sim vs the real race">
                <LapChart
                  traces={simDeltaTraces}
                  mode="pace"
                  uptoLap={lap}
                  totalLaps={totalLaps}
                  label="Cumulative delta"
                  domain={simDeltaDomain}
                  zeroLine
                />
                <ChartLegend traces={simDeltaTraces} />
                <p className="racesync-panel-note">
                  Seconds gained or lost against the driver’s own logged race, lap
                  by lap — above the line is slower than the real race, below is
                  quicker.
                </p>
              </Panel>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default RaceSyncGraphs;
