import { Link } from 'react-router-dom';
import HeroBanner from '../components/HeroBanner';
import FeaturedVideos from '../components/FeaturedVideos';
import Faq from '../components/Faq';
import Footer from '../components/Footer';
import { useAuth } from '../context/AuthContext';

// One card per public page. Descriptions say what each page really shows
// today; keep them in step with the pages.
const DESTINATIONS = [
  {
    to: '/overview',
    label: 'Overview',
    short: 'Ov',
    desc: 'A snapshot of the platform: the latest synced session, the top of the drivers\' standings and a two-team comparison.',
  },
  {
    to: '/fixtures',
    label: 'Fixtures & Events',
    short: 'Fx',
    desc: 'Every synced session, with the event log each statistic is derived from.',
  },
  {
    to: '/statistics',
    label: 'Statistics',
    short: 'St',
    desc: 'Driver tables for a season, a whole career, or a single fixture.',
  },
  {
    to: '/timetravel',
    label: 'Time-Travel',
    short: 'Tt',
    desc: 'See how a driver\'s result in a session changed as data was added and corrected.',
  },
  {
    to: '/replay',
    label: 'Race Replay',
    short: 'Rr',
    desc: 'Step through a synced race lap by lap: positions, tyres and race control on a track map.',
  },
  {
    to: '/drivers',
    label: 'Drivers',
    short: 'Dr',
    desc: 'Profiles and season results for each driver in the series.',
  },
  {
    to: '/teams',
    label: 'Teams',
    short: 'Tm',
    desc: 'Profiles and season results for each team in the series.',
  },
  {
    to: '/telemetry-tv',
    label: 'Telemetry TV',
    short: 'Tv',
    desc: 'Archived INDYCAR race broadcasts played alongside the race report data.',
  },
];

const pad = (n) => String(n).padStart(2, '0');

function WelcomePage() {
  const { user } = useAuth();

  return (
    <div className="welcome-page">
      <div className="welcome-hero-wrap">
        <HeroBanner />
      </div>

      <section className="explore-section">
        <div className="page">
          <div className="section-head">
            <div className="tag">Explore the platform</div>
            <h2 className="section-title">Where do you want to go?</h2>
            <p className="section-sub">Pick a page to jump straight in.</p>
          </div>
          <div className="explore-grid">
            {DESTINATIONS.map((d, index) => (
              <Link key={d.to} to={d.to} className="explore-card">
                <span className="explore-index">{pad(index + 1)}</span>
                <div className="explore-icon">{d.short}</div>
                <div>
                  <p className="explore-name">{d.label}</p>
                  <p className="explore-desc">{d.desc}</p>
                </div>
              </Link>
            ))}
          </div>
          {!user && (
            <p className="explore-signin-note">
              <Link to="/sign-in">Sign in</Link> to follow drivers and teams and get notifications about them.
              Developers can then turn on developer mode in Profile → Settings to submit datasets and code.
            </p>
          )}
        </div>
      </section>

      <FeaturedVideos />
      <Faq />
      <Footer />
    </div>
  )
}

export default WelcomePage;
