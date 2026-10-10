import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOverview } from '../api/client';
import heroImg1 from '../assets/hero/hero-1.jpg';
import heroImg2 from '../assets/hero/hero-2.jpg';
import heroImg3 from '../assets/hero/hero-3.jpg';
import heroImg4 from '../assets/hero/hero-4.jpg';
import heroImg5 from '../assets/hero/hero-5.jpg';

const HERO_IMAGES = [heroImg1, heroImg2, heroImg3, heroImg4, heroImg5];
const SLIDE_INTERVAL_MS = 3000;

// The latest synced session, from the same /api/overview call the Overview
// page uses. If it can't be loaded the banner still renders, with a plain
// eyebrow and a link to the fixtures list.
function useLatestSession() {
  const [latest, setLatest] = useState(null);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => getOverview())
      .then((data) => {
        if (!cancelled && data) setLatest({ season: data.season ?? null, session: data.latestSession ?? null });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return latest;
}

export function heroEyebrow(latest) {
  if (!latest?.session) return 'Formula 1 analytics';
  const { meetingName, type } = latest.session;
  const season = latest.season ? `${latest.season} season · ` : '';
  return `${season}Latest: ${meetingName} ${type}`;
}

function HeroBanner() {
  const [activeIndex, setActiveIndex] = useState(0);
  const latest = useLatestSession();
  const session = latest?.session;

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % HERO_IMAGES.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="hero-banner">
      <div className="hero-content">
        <div className="hero-eyebrow">{heroEyebrow(latest)}</div>
        <h1 className="hero-title">F1Lytics</h1>
        <p className="hero-body">
          Every statistic on F1Lytics — lap times, pit stops, positions and points — is derived from race event data, not typed in by hand.
        </p>
        {session ? (
          <Link to={`/fixtures?session=${encodeURIComponent(session.id)}`} className="hero-cta">
            Open the latest fixture
          </Link>
        ) : (
          <Link to="/fixtures" className="hero-cta">Browse fixtures</Link>
        )}
      </div>
      <div className="hero-image-panel">
        {HERO_IMAGES.map((src, i) => (
          <img
            key={src}
            src={src}
            alt="Formula 1 action shot"
            className={`hero-image-slide${i === activeIndex ? ' is-active' : ''}`}
          />
        ))}
        <div className="hero-image-overlay" />
      </div>
    </div>
  );
}

export default HeroBanner;
