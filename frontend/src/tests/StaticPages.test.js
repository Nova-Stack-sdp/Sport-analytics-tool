import { fireEvent, render, screen } from '@testing-library/react';
import AdminPage from '../pages/AdminPage';
import DatasetsPage from '../pages/DatasetsPage';
import SubmissionsPage from '../pages/SubmissionsPage';
import WatchLivePage from '../pages/WatchLivePage';

describe('static platform pages', () => {
  test('renders the datasets distribution workflow and published releases', () => {
    render(<DatasetsPage />);
    expect(screen.getByText('Build a custom export')).toBeInTheDocument();
    expect(screen.getByText('Request export')).toBeInTheDocument();
    expect(screen.getByText('Driver telemetry')).toBeInTheDocument();
    expect(screen.getByText('v2026.10.20')).toBeInTheDocument();
  });

  test('renders the submissions pipeline and switches review tabs', () => {
    render(<SubmissionsPage />);
    expect(screen.getByText(/Batch validation.*1 error found/)).toBeInTheDocument();
    expect(screen.getByText('Correction history')).toBeInTheDocument();
    const approved = screen.getByText('Approved', { selector: '.tab' });
    fireEvent.click(approved);
    expect(approved).toHaveClass('active');
    fireEvent.click(screen.getByText('Rejected', { selector: '.tab' }));
    expect(screen.getByText('Rejected', { selector: '.tab' })).toHaveClass('active');
  });

  test('renders every administration tab and all data-state actions', () => {
    render(<AdminPage />);
    expect(screen.getByText('Submitter accounts')).toBeInTheDocument();
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getAllByText('Suspend').length).toBeGreaterThan(0);
    expect(screen.getByText('Reactivate')).toBeInTheDocument();

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

  test('embeds the live video with safe iframe attributes', () => {
    render(<WatchLivePage />);
    const frame = screen.getByTitle('YouTube video player');
    expect(frame).toHaveAttribute('src', expect.stringContaining('youtube.com/embed'));
    expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  });
});
