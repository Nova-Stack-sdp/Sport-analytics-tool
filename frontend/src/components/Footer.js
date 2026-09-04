import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PLATFORM_LINKS = [
  { to: '/overview', label: 'Overview' },
  { to: '/fixtures', label: 'Fixtures & events' },
  { to: '/statistics', label: 'Statistics' },
  { to: '/timetravel', label: 'Time-Travel' },
];

function Footer() {
  const { user } = useAuth();

  return (
    <footer>
      <div className="page">
        <div className="footer-grid">
          <div>
            <div className="footer-brand-mark">
              <div className="brand-badge">F1</div>
              <div className="footer-brand-name">Nova Stack</div>
            </div>
            <p className="footer-tagline">Live Formula 1 analytics, derived from race event data.</p>
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
              <li><Link to="/sign-in">Sign in</Link></li>
              <li><Link to="/sign-up">Create account</Link></li>
              {user && <li><Link to="/submissions">Submissions</Link></li>}
            </ul>
          </div>
          <div>
            <div className="footer-col-title">Developers</div>
            <ul className="footer-links">
              {user && <li><Link to="/datasets">Datasets</Link></li>}
              {user && <li><Link to="/developer">Developer docs</Link></li>}
              {!user && <li><Link to="/sign-in">Sign in for developer tools</Link></li>}
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p className="footer-copy">© 2026 Nova Stack. Data sourced via the OpenF1 API.</p>
          <div className="footer-live"><span className="dot" />2026 season · live</div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
