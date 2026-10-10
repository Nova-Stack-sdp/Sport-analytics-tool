import { useId, useState } from 'react';

// One of the page's three race phases — live observation, analysis, deeper
// investigation — as a band that folds away from its own chapter mark. The
// mark reads exactly like SectionDivider (numbered step, label, hairline) and
// is the toggle itself, so the place a viewer looks to see where they are on
// the page is also where they fold it. Open by default, so the page still
// reads top to bottom on arrival.
//
// The body is hidden with the hidden attribute rather than unmounted, like
// CollapsiblePanel: folding is a view choice, never a data loss — and the
// broadcast player in the first phase keeps running (and keeps driving the
// lap clock) while its band is folded away.
function PhaseSection({ step, label, children }) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();

  return (
    <section className={`ttv-phase${open ? '' : ' is-collapsed'}`} aria-label={label}>
      <button
        type="button"
        className="ttv-section-divider ttv-phase-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
        onClick={() => setOpen((current) => !current)}
      >
        {step && (
          <span className="ttv-section-divider-step mono" aria-hidden="true">
            {step}
          </span>
        )}
        <span className="ttv-section-divider-label">{label}</span>
        <span className="ttv-section-divider-rule" aria-hidden="true" />
        <span className="ttv-phase-state">
          {open ? 'Collapse' : 'Expand'}
          <svg className="ttv-phase-chevron" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 4.25 6 8.25 10 4.25" />
          </svg>
        </span>
      </button>

      <div className="ttv-phase-body" id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

export default PhaseSection;
