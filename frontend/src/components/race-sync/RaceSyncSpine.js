import { useRef, useState } from 'react';
// The same id map the rail and the panels carry, so a jump here lands on
// exactly the section the rail would.
import { SECTION_ANCHORS } from './raceSyncAnchors';

// The three-phase workflow spine the page's tagline promises: Observe the
// race, Diagnose why it happened, Simulate a change. Observe and Diagnose are
// honest jumps to the sections that already carry those readings; Simulate
// has no data behind it yet and says so, the same rule the rail's unavailable
// rows follow. The spine takes a full row of the readings grid under the map
// — the place the design gives the banner — and it gathers the replay's whole
// transport beside its red mark: the chevrons, pause and speed used to live
// in the race band, but every control that drives the playhead belongs on
// one bar next to the mark that says what the replay is doing. It renders
// only once a race is picked, so its jumps always have somewhere to land.
const STEPS = [
  {
    id: 'observe',
    number: 1,
    title: 'Observe',
    question: 'What happened?',
    anchor: SECTION_ANCHORS.overview,
  },
  {
    id: 'diagnose',
    number: 2,
    title: 'Diagnose',
    question: 'Why did it happen?',
    anchor: SECTION_ANCHORS.driverAnalysis,
  },
  {
    id: 'simulate',
    number: 3,
    title: 'Simulate',
    question: 'What if we changed it?',
    unavailable: {
      hint: 'no simulation data',
      reason:
        'Counterfactuals need data this page doesn’t have yet — nothing here simulates a changed race',
    },
  },
];

function RaceSyncSpine({
  lap,
  totalLaps,
  atEnd,
  playing,
  speed,
  onJumpToLap,
  onTogglePlaying,
  onCycleSpeed,
  onReplay,
}) {
  // The active step is the last one jumped to. The spine doesn't scroll-spy
  // (the rail already follows the page's scroll) — it remembers where the
  // reader last asked to go.
  const [activeId, setActiveId] = useState(STEPS[0].id);

  // The lap chip is a jump box as well as a readout, so the number being
  // typed needs a draft of its own: the replay ticking on underneath must
  // not overwrite what is being typed.
  const [lapDraft, setLapDraft] = useState(null);
  const lapAtFocusRef = useRef(null);

  const jumpTo = (step) => {
    const target = document.getElementById(step.anchor);
    if (target == null) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveId(step.id);
  };

  // The chevrons are the red mark's two directions — a lap back, a lap
  // forward, on this replay's own lap clock.
  const stepBack = () => onJumpToLap((lap ?? 0) - 1);
  const stepForward = () => onJumpToLap((lap ?? 0) + 1);

  // The jump box: focusing starts the draft from the lap on screen — reading
  // the box never moves the playhead — and selects it, so a typed lap
  // replaces the readout instead of being inserted into the middle of it.
  // (A number input refuses to be selected, which is why this is a text box
  // with a numeric keypad.) Confirming sends the replay there without
  // disturbing play or pause, and an out-of-range lap is answered rather
  // than refused: jumpToLap clamps to the race, so a typo lands on the
  // nearest real lap.
  const beginLapEdit = (event) => {
    lapAtFocusRef.current = lap;
    setLapDraft(String(lap));
    event.target.select();
  };
  const commitLapEdit = () => {
    const typed = lapDraft;
    setLapDraft(null);
    if (typed == null || typed === String(lapAtFocusRef.current)) return;
    const wanted = Number.parseInt(typed, 10);
    if (Number.isFinite(wanted)) onJumpToLap(wanted);
  };
  const handleLapKey = (event) => {
    if (event.key === 'Enter') commitLapEdit();
    if (event.key === 'Escape') setLapDraft(null);
  };

  // The red mark says what the replay is doing: Play starts this race (or
  // picks a paused one back up), Restart plays it again from the first lap.
  // At the end the label is Replay once more, because the only race left to
  // play is the whole one.
  const replayLabel = playing ? 'Restart the race' : atEnd ? 'Replay the race' : 'Play the race';

  return (
    <div className="racesync-spine" role="group" aria-label="Race workflow">
      <ol className="racesync-spine-steps">
        {STEPS.map((step, index) => {
          const unavailable = step.unavailable ?? null;
          return (
            <li className="racesync-spine-step-item" key={step.id}>
              {index > 0 && (
                <span className="racesync-spine-sep" aria-hidden="true">
                  ›
                </span>
              )}
              <button
                type="button"
                className={[
                  'racesync-spine-step',
                  !unavailable && activeId === step.id ? ' is-active' : '',
                  unavailable ? ' is-unavailable' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={unavailable ? unavailable.reason : undefined}
                aria-current={!unavailable && activeId === step.id ? 'step' : undefined}
                aria-disabled={unavailable ? 'true' : undefined}
                onClick={unavailable ? undefined : () => jumpTo(step)}
              >
                <span className="racesync-spine-step-num" aria-hidden="true">
                  {step.number}
                </span>
                <span className="racesync-spine-step-text">
                  <span className="racesync-spine-step-title">{step.title}</span>
                  <span className="racesync-spine-step-question">{step.question}</span>
                  {unavailable && (
                    <span className="racesync-spine-step-hint">{unavailable.hint}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="racesync-spine-tools">
        {/* The replay transport, moved up from the race band so every control
            that drives the playhead sits on this one bar next to the red
            mark. The chevrons flank the type-in lap chip; pause keeps the
            middle seat between the steps and the mark, and the speed cycle
            sits beside it — same engine, same lap clock, same speeds as
            Race Replay's own viewer. */}
        <div className="racesync-spine-transport">
          <button
            type="button"
            className="racesync-spine-transport-btn"
            title="Back one lap"
            aria-label="Back one lap"
            onClick={stepBack}
            disabled={lap == null || lap <= 0}
          >
            {/* Two chevrons, one glyph — the mirror of the forward pair, so
                the two ends of the cluster read as one control. */}
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M11 7 6 12l5 5M18 7l-5 5 5 5" />
            </svg>
          </button>
          {lap != null && totalLaps != null && (
            <span className="racesync-spine-lap">
              {/* Same words as a readout, but the number is the jump box:
                  type a lap into it and press Enter — or click away — to
                  send the replay there. */}
              <label className="racesync-spine-lap-caption">
                Lap
                <input
                  className="racesync-spine-lap-input"
                  type="text"
                  inputMode="numeric"
                  title={`Jump to a lap between 0 and ${totalLaps}`}
                  value={lapDraft ?? lap}
                  onFocus={beginLapEdit}
                  onChange={(event) => setLapDraft(event.target.value)}
                  onBlur={commitLapEdit}
                  onKeyDown={handleLapKey}
                />
              </label>
              <span className="racesync-spine-lap-total">/ {totalLaps}</span>
            </span>
          )}
          <button
            type="button"
            className="racesync-spine-transport-btn"
            title="Forward one lap"
            aria-label="Forward one lap"
            onClick={stepForward}
            disabled={lap == null || atEnd}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M13 7l5 5-5 5M6 7l5 5-5 5" />
            </svg>
          </button>
          <button
            type="button"
            className="racesync-spine-transport-btn"
            title={playing ? 'Pause the replay' : 'Resume the replay'}
            aria-label={playing ? 'Pause the replay' : 'Resume the replay'}
            onClick={onTogglePlaying}
            disabled={atEnd}
          >
            {playing ? '⏸' : '▶'}
          </button>
          <button
            type="button"
            className="racesync-spine-transport-btn"
            title="Replay speed"
            aria-label={`Replay speed ${speed}×`}
            onClick={onCycleSpeed}
          >
            {speed}×
          </button>
        </div>

        <button
          type="button"
          className="racesync-primary-btn"
          title={replayLabel}
          aria-label={replayLabel}
          onClick={onReplay}
        >
          {playing ? 'Restart' : atEnd ? 'Replay' : 'Play'}
        </button>
      </div>
    </div>
  );
}

export default RaceSyncSpine;
