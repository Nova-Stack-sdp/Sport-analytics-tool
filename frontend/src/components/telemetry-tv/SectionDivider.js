// The chapter mark between page bands: a numbered step, a hairline, and a
// small-caps label that reads the viewer down the page — observation, analysis,
// deeper investigation, then the answers that only exist after the checkered
// flag. The number is what makes the order legible at a glance, so the four
// bands never read as a flat list of cards.
function SectionDivider({ step, label }) {
  return (
    <div className="ttv-section-divider" role="separator" aria-label={label}>
      {step && (
        <span className="ttv-section-divider-step mono" aria-hidden="true">
          {step}
        </span>
      )}
      <span className="ttv-section-divider-label">{label}</span>
      <span className="ttv-section-divider-rule" aria-hidden="true" />
    </div>
  );
}

export default SectionDivider;
