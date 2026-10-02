// Where the section rail sends you, and what the page answers to. One module
// owns the ids: a rail row and the card it points at are written from the same
// string, so a rename cannot leave a row pointing at nothing. The rail also
// reads the same ids at click time (document.getElementById) — a target that
// needs a picked race simply is not in the DOM yet.
//
// The prefix is deliberate: raceSync.css carries one scroll-margin rule for
// every anchor, so a jump lands clear of the sticky RaceSync header.
export const SECTION_ANCHORS = {
  // The stage itself, which is also the guide before a race is picked.
  overview: 'racesync-section-overview',
  // The pace card, with the race-state table above it.
  driverAnalysis: 'racesync-section-driver-analysis',
  // The tyre stints, with the pit stops beneath them.
  strategy: 'racesync-section-strategy',
  // The lap-time delta chart.
  lapTime: 'racesync-section-lap-time',
  // The twin line chart.
  comparison: 'racesync-section-comparison',
};
