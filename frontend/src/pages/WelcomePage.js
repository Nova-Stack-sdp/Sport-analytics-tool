import { Link } from 'react-router-dom';
import HeroBanner from '../components/HeroBanner';
import FeaturedVideos from '../components/FeaturedVideos';
import Faq from '../components/Faq';
import Footer from '../components/Footer';
import { useAuth } from '../context/AuthContext';

const DESTINATIONS = [
  {
    to: '/overview',
    label: 'Overview',
    short: 'Ov',
    desc: 'The current season at a glance — standings, live gaps, and the numbers that matter right now.',
  },
  {
    to: '/fixtures',
    label: 'Fixtures & Events',
    short: 'Fx',
    desc: 'Every session on the calendar, with the lap-by-lap event feed as it unfolds.',
  },
  {
    to: '/statistics',
    label: 'Statistics',
    short: 'St',
    desc: 'Deep-dive tables and comparisons across drivers, teams, and sessions.',
  },
  {
    to: '/timetravel',
    label: 'Time-Travel',
    short: 'Tt',
    desc: 'Rewind any session to see exactly what the standings looked like at a given moment.',
  },
];

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
            <p className="section-sub">Four ways into the data — pick one to jump straight in.</p>
          </div>
          <div className="explore-grid">
            {DESTINATIONS.map((d, index) => (
              <Link key={d.to} to={d.to} className="explore-card">
                <span className="explore-index">0{index + 1}</span>
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
              <Link to="/sign-in">Sign in</Link> to unlock Submissions, Datasets, and Developer tools.
            </p>
          )}
        </div>
      </section>

      <FeaturedVideos />
      <Faq />
      <Footer />
    </div>
  );
}

export default WelcomePage;
