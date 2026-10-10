import { Link, useSearchParams } from 'react-router-dom';
import { useDeveloperMode } from '../context/DeveloperModeContext';
import DatasetsPanel from '../components/developer/DatasetsPanel';
import SubmissionsPanel from '../components/developer/SubmissionsPanel';
import CodeSubmissionPage from './CodeSubmissionPage';

// Datasets, Submit Code and Submit Dataset used to be separate pages in the
// nav; they're now tabs here, since they're only useful to developers anyway.
// Each tab has a URL slug so /datasets, /submissions and /code-submissions
// can redirect straight to it. 'submissions' is the old slug of the Submit
// Dataset tab.
const DEVELOPER_TABS = [
  { slug: 'console', label: 'API Console' },
  { slug: 'datasets', label: 'Datasets' },
  { slug: 'submit-code', label: 'Submit Code' },
  { slug: 'submit-dataset', label: 'Submit Dataset' },
];
const DEFAULT_TAB = DEVELOPER_TABS[0].slug;
const TAB_ALIASES = { submissions: 'submit-dataset' };

function tabFromParam(value) {
  const slug = TAB_ALIASES[value] ?? value;
  return DEVELOPER_TABS.some((tab) => tab.slug === slug) ? slug : DEFAULT_TAB;
}

// Shown to any signed-in user who hasn't switched on developer mode yet.
// Explains what the developer role is for, and how to turn it on —
// nothing here assumes the reader has any technical background.
function DeveloperExplainer() {
  return (
    <div className="page" id="page-developer">
      <div className="pagehead">
        <div className="section-eyebrow">For contributors, not just consumers</div>
        <div className="section-title">Developer</div>
        <div className="section-desc">
          Developer mode is for anyone who wants to go beyond browsing the site — submitting a new
          derived statistic (a stat computed from existing race data that we haven't already built)
          for an admin to review and, if approved, add to the site and the public API.
        </div>
      </div>
      <div className="content">
        <div className="rationale">
          <span className="ic">◆</span>
          <div>
            <b>What developer mode unlocks:</b> four tabs on this page — the API Console, Datasets
            (the underlying race data available to work with), Submit Code (where a proposed stat's
            script is submitted for review) and Submit Dataset (where a batch of race data is
            submitted and its review status is tracked). Nothing you submit goes live on its own — an admin
            reviews it first.
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <div className="card-title">How to turn on developer mode</div>
          </div>
          <ol className="developer-steps">
            <li>
              Go to <Link to="/profile?tab=settings">Profile → Settings</Link>.
            </li>
            <li>Find the <b>Developer mode</b> toggle.</li>
            <li>Switch it on.</li>
          </ol>
          <div className="card-note">
            You can switch it off again at any time from the same place — it doesn't affect anything
            you've already submitted.
          </div>
          <Link to="/profile?tab=settings" className="btn btn-ghost btn-full" style={{ marginTop: 14 }}>
            Go to Settings
          </Link>
        </div>
      </div>
    </div>
  );
}

// The API console — the original Developer page content, now the first tab.
function ApiConsolePanel() {
  return (
    <div className="developer-panel" id="developer-console">
      <div className="card">
        <div className="card-head"><div className="card-title">API endpoints</div></div>
        <p className="card-note">Read race data and approved scripts through the public API. Use the Datasets tab to download events or driver season statistics.</p>
        {[
          ['/api/v1/fixtures', 'Race sessions'],
          ['/api/v1/events', 'Filtered event log'],
          ['/api/v1/statistics/drivers', 'Driver season statistics'],
          ['/api/v1/statistics/teams', 'Team season statistics'],
          ['/api/v1/code', 'Approved developer scripts'],
        ].map(([path, description]) => (
          <div className="endpoint-row" key={path}>
            <span className="method get">GET</span><span className="path">{path}</span><span className="desc">{description}</span>
          </div>
        ))}
        <Link to="/developer/api-docs" className="btn btn-ghost btn-full" style={{ marginTop: 14 }}>View full API documentation</Link>
      </div>
    </div>
  );
}

// Shown once developer mode is switched on: the console plus the Datasets
// Submit Code and Submit Dataset tools, as tabs.
function DeveloperWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = tabFromParam(searchParams.get('tab'));

  const selectTab = (slug) => {
    setSearchParams(slug === DEFAULT_TAB ? {} : { tab: slug }, { replace: true });
  };

  return (
    <div className="page" id="page-developer">
      <div className="pagehead">
        <div className="section-eyebrow">Data and contributions</div>
        <div className="section-title">Developer</div>
        <div className="section-desc">
          Explore the public API, export race data, and submit scripts and datasets for review.
        </div>
      </div>
      <div className="content">
        <div className="tabs developer-tabs" role="tablist" aria-label="Developer tools">
          {DEVELOPER_TABS.map((tab) => (
            <button
              key={tab.slug}
              className={`tab${activeTab === tab.slug ? ' active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.slug}
              onClick={() => selectTab(tab.slug)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'console' && <ApiConsolePanel />}
        {activeTab === 'datasets' && <DatasetsPanel />}
        {activeTab === 'submit-code' && <CodeSubmissionPage />}
        {activeTab === 'submit-dataset' && <SubmissionsPanel />}
      </div>
    </div>
  );
}

function DeveloperPage() {
  const { isDeveloperMode } = useDeveloperMode();
  return isDeveloperMode ? <DeveloperWorkspace /> : <DeveloperExplainer />;
}

export default DeveloperPage;