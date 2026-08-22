import { Link } from 'react-router-dom';

function HeroBanner() {
  return (
    <div className="hero-banner">
      <div className="hero-content">
        <div className="hero-eyebrow">Live · Round 6</div>
        <h1 className="hero-title">NOVA STACK</h1>
        <p className="hero-body">
          Every statistic on this page — lap times, pit stops, sector splits, penalties — is derived from race event data, not typed in by hand.
        </p>
        <Link to="/fixtures" className="hero-cta">Open live fixture</Link>
      </div>
      <div className="hero-image-panel">
        <img
          src="https://images.unsplash.com/photo-1752884991461-8ac432ad9266?fm=jpg&q=80&w=1200&auto=format&fit=crop"
          alt="Formula 1 cars at the start of a Grand Prix"
        />
        <div className="hero-image-overlay" />
      </div>
    </div>
  );
}

export default HeroBanner;