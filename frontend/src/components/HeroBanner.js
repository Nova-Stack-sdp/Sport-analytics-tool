import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import heroImg1 from '../assets/hero/hero-1.jpg';
import heroImg2 from '../assets/hero/hero-2.jpg';
import heroImg3 from '../assets/hero/hero-3.jpg';
import heroImg4 from '../assets/hero/hero-4.jpg';
import heroImg5 from '../assets/hero/hero-5.jpg';

const HERO_IMAGES = [heroImg1, heroImg2, heroImg3, heroImg4, heroImg5];
const SLIDE_INTERVAL_MS = 3000;

function HeroBanner() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % HERO_IMAGES.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

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
