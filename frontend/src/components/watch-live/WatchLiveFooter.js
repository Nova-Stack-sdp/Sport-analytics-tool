// Minimal footer with data sources attribution.
function WatchLiveFooter() {
  return (
    <footer className="watch-live-footer">
      <div className="footer-content">
        <div className="footer-brand">
          <span className="wire-pill">WIRE</span>
        </div>
        <div className="footer-attribution">
          <p className="footer-text">
            Data sources: OpenF1 community/unofficial data, heuristic momentum/battle predictions, third-party YouTube video used only as a synced visual reference.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default WatchLiveFooter;
