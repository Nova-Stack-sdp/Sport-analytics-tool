import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminPage from '../pages/AdminPage';
import DatasetsPanel from '../components/developer/DatasetsPanel';
import SubmissionsPanel from '../components/developer/SubmissionsPanel';
import TelemetryTVPage from '../pages/TelemetryTVPage';
import { getTelemetryTVRaces, listCodeSubmissions } from '../api/client';

jest.mock('../api/client', () => ({
  getTelemetryTVRaces: jest.fn(),
  listCodeSubmissions: jest.fn(),
  listSubmissions: jest.fn(() => Promise.resolve({ submissions: [] })),
}));

describe('static platform pages', () => {
  test('renders the datasets distribution workflow and published releases', () => {
    render(<DatasetsPanel />);
    expect(screen.getByText('Build a custom export')).toBeInTheDocument();
    expect(screen.getByText('Request export')).toBeInTheDocument();
    expect(screen.getByText('Driver telemetry')).toBeInTheDocument();
    expect(screen.getByText('v2026.10.20')).toBeInTheDocument();
  });

  test('renders the submissions pipeline and switches review tabs', () => {
    render(<SubmissionsPanel />);
    expect(screen.getByText('Submit a batch')).toBeInTheDocument();
    expect(screen.getByText('Review & approval queue')).toBeInTheDocument();

    const approved = screen.getByText('Approved', { selector: '.tab' });
    fireEvent.click(approved);
    expect(approved).toHaveClass('active');
    fireEvent.click(screen.getByText('Rejected', { selector: '.tab' }));
    expect(screen.getByText('Rejected', { selector: '.tab' })).toHaveClass('active');
  });

  test('renders every administration tab and all data-state actions', async () => {
    listCodeSubmissions.mockResolvedValue({ submissions: [], counts: { pending: 0, approved: 0, rejected: 0 } });
    render(<AdminPage />);
    expect(await screen.findByText('No code submissions')).toBeInTheDocument();
    expect(screen.getByText('Code submissions')).toBeInTheDocument();
    expect(screen.queryByText('Submitter accounts')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('API Keys', { selector: '.tab' }));
    expect(screen.getByText('API keys & quotas')).toBeInTheDocument();
    expect(screen.getAllByText('Revoke').length).toBeGreaterThan(0);
    expect(screen.getByText('92%')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Dataset Releases', { selector: '.tab' }));
    expect(screen.getByText('Release management')).toBeInTheDocument();
    expect(screen.getByText('Publish')).toBeInTheDocument();
    expect(screen.getAllByText('Deprecate').length).toBeGreaterThan(0);
    expect(screen.getByText('Schema documentation')).toBeInTheDocument();

    fireEvent.click(screen.getByText('API Versions', { selector: '.tab' }));
    expect(screen.getByText('Version lifecycle')).toBeInTheDocument();
    expect(screen.getByText('Notify consumers')).toBeInTheDocument();
    expect(screen.getByText('View changelog')).toBeInTheDocument();
    expect(screen.getByText('v2 → v3 migration progress')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Reconciliation', { selector: '.tab' }));
    expect(screen.getByText('Submitter disagreements & corrections')).toBeInTheDocument();
    expect(screen.getAllByText('Resolve').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Escalate').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Propagated ✓').length).toBeGreaterThan(0);
    expect(screen.getByText('Correction propagation log')).toBeInTheDocument();
  });

  test('does not embed a video when no race catalogue can be loaded', async () => {
    getTelemetryTVRaces.mockRejectedValue(new Error('catalogue unavailable'));
    // The picker bar carries the page's link across to RaceSync, so the page
    // needs a router around it even when the video itself never loads.
    render(
      <MemoryRouter>
        <TelemetryTVPage />
      </MemoryRouter>
    );
    // A failed catalogue leaves the page on its guide — nothing is picked, so
    // the video panel never mounts to say "No video source configured". The
    // guide is what reports the failure instead.
    expect(await screen.findByText('catalogue unavailable')).toBeInTheDocument();
    expect(screen.queryByTitle('YouTube video player')).not.toBeInTheDocument();
  });
});
