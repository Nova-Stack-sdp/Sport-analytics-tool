// The chapter mark between page bands: a hairline each side, an accent arrow
// and a small-caps label that reads the viewer from observation into
// analysis, and from analysis into the deeper investigation below it.
function SectionDivider({ label }) {
  return (
    <div className="ttv-section-divider" role="separator" aria-label={label}>
      <span className="ttv-section-divider-arrow" aria-hidden="true">▼</span>
      <span className="ttv-section-divider-label">{label}</span>
    </div>
  );
}

export default SectionDivider;
