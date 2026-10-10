import { useState } from 'react';
import CodeSubmissionsPanel from '../components/admin/CodeSubmissionsPanel';
import DatasetSubmissionsPanel from '../components/admin/DatasetSubmissionsPanel';
import VideoRequestsTab from '../components/admin/VideoRequestsTab';

const ADMIN_TABS = ['Code Submissions', 'Dataset Submissions', 'Video Requests'];

function AdminPage() {
  const [activeTab, setActiveTab] = useState('Code Submissions');

  return (
    <div className="page" id="page-admin">
      <div className="pagehead">
        <div className="section-eyebrow">System administration</div>
        <div className="section-title">Admin</div>
        <div className="section-desc">
          Review submitted scripts, datasets and race video requests, inspect uploads, and manage accepted or deleted data.
        </div>
      </div>
      <div className="content">
        <div className="tabs" style={{ marginBottom: 18 }}>
          {ADMIN_TABS.map((tab) => (
            <button
              type="button"
              aria-pressed={activeTab === tab}
              key={tab}
              className={`tab${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Code Submissions' && <CodeSubmissionsPanel />}
        {activeTab === 'Dataset Submissions' && <DatasetSubmissionsPanel />}
        {activeTab === 'Video Requests' && <VideoRequestsTab />}
      </div>
    </div>
  );
}

export default AdminPage;
