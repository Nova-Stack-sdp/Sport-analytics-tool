import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Every public page, in the same order as the welcome page's cards.
const PLATFORM_LINKS = [
  { to: '/overview', label: 'Overview' },
  { to: '/fixtures', label: 'Fixtures & events' },
  { to: '/statistics', label: 'Statistics' },
  { to: '/timetravel', label: 'Time-Travel' },
  { to: '/replay', label: 'Race Replay' },
  { to: '/drivers', label: 'Drivers' },
  { to: '/teams', label: 'Teams' },
  { to: '/telemetry-tv', label: 'Telemetry TV' },
];

function AccountLinks({ user }) {
  if (!user) {
    return (
      <>
        <li><Link to="/sign-in">Sign in</Link></li>
        <li><Link to="/sign-up">Create account</Link></li>
      </>
    );
  }
  return (
    <>
      <li><Link to="/profile">Profile</Link></li>
      <li><Link to="/profile?tab=notifications">Notifications</Link></li>
      <li><Link to="/profile?tab=settings">Settings</Link></li>
    </>
  );
}

// The developer tools need a signed-in, verified account with developer
// mode turned on (Profile → Settings), so each state gets the next step.
function DeveloperLinks({ user, isDeveloperMode }) {
  if (!user) {
    return <li><Link to="/sign-in">Sign in to submit data</Link></li>;
  }
  if (!isDeveloperMode) {
    return <li><Link to="/profile?tab=settings">Turn on developer mode</Link></li>;
  }
  return (
    <>
      <li><Link to="/developer">Developer workspace</Link></li>
      <li><Link to="/developer/api-docs">API docs</Link></li>
    </>
  );
}

function Footer() {
  const { user, isDeveloperMode } = useAuth();
  const year = new Date().getFullYear();

  return (
    <footer>
      <div className="page">
        <div className="footer-grid">
          <div>
            <div className="footer-brand-mark">
              <div className="brand-badge">F1</div>
              <div className="footer-brand-name">F1Lytics</div>
            </div>
            <p className="footer-tagline">Formula 1 analytics, derived from race event data.</p>
          </div>
          <div>
            <div className="footer-col-title">Platform</div>
            <ul className="footer-links">
              {PLATFORM_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="footer-col-title">Account</div>
            <ul className="footer-links">
              <AccountLinks user={user} />
            </ul>
          </div>
          <div>
            <div className="footer-col-title">Developers</div>
            <ul className="footer-links">
              <DeveloperLinks user={user} isDeveloperMode={isDeveloperMode} />
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p className="footer-copy">© {year} F1Lytics. Race data from the OpenF1 API.</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
