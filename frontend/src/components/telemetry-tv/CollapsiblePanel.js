import { memo, useId, useState } from 'react';

// The shell the page's analysis cards share: one card head — title, sub-line,
// whatever pill the card carries — plus a toggle that folds the body away.
// Open by default, so the page still reads top to bottom on arrival; the
// controls sit at the end of the head, beside the pill, where a viewer's eye
// already lands when looking for something to press.
//
// The toggle is a real button with aria-expanded/aria-controls, and the body is
// hidden with the hidden attribute rather than by unmounting, so collapsing is
// a view choice and never a data loss.
const CollapsiblePanel = memo(function CollapsiblePanel({
  className = '',
  title,
  sub = null,
  aside = null,
  ariaLabel,
  children,
}) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();

  return (
    <section className={`card ttv-panel ${className}`.trim()} aria-label={ariaLabel}>
      <div className="card-head">
        <div className="ttv-panel-heading">
          <div className="card-title">{title}</div>
          {sub && <div className="card-title-sub">{sub}</div>}
        </div>
        <div className="ttv-panel-controls">
          {aside}
          <button
            type="button"
            className="ttv-panel-toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
            onClick={() => setOpen((current) => !current)}
          >
            <span className="ttv-panel-toggle-label">{open ? 'Collapse' : 'Expand'}</span>
            <svg className="ttv-panel-chevron" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 4.25 6 8.25 10 4.25" />
            </svg>
          </button>
        </div>
      </div>

      <div className="ttv-panel-body" id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
});

export default CollapsiblePanel;
