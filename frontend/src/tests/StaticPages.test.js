import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminPage from '../pages/AdminPage';
import DatasetsPanel from '../components/developer/DatasetsPanel';
import SubmissionsPanel from '../components/developer/SubmissionsPanel';
import TelemetryTVPage from '../pages/TelemetryTVPage';
import { getTelemetryTVRaces, listCodeSubmissions, listAdminDatasets } from '../api/client';

jest.mock('../api/client', () => ({
  getTelemetryTVRaces: jest.fn(),
  listCodeSubmissions: jest.fn(),
  listAdminDatasets: jest.fn(),
  listSubmissions: jest.fn(() => Promise.resolve({ submissions: [] })),
}));

describe('static platform pages', () => {
  test('renders the dataset export form without mock releases', () => {
    render(<DatasetsPanel />);
    expect(screen.getByText('Build a custom export')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download export' })).toBeInTheDocument();
    expect(screen.queryByText('Published releases')).not.toBeInTheDocument();
  });

  test('renders the submissions pipeline and switches review tabs', () => {
    render(<SubmissionsPanel />);
    expect(screen.getByText('Submit a batch')).toBeInTheDocument();
    expect(screen.getByText('My submissions')).toBeInTheDocument();

    const approved = screen.getByText('Approved', { selector: '.tab' });
    fireEvent.click(approved);
    expect(approved).toHaveClass('active');
    fireEvent.click(screen.getByText('Rejected', { selector: '.tab' }));
    expect(screen.getByText('Rejected', { selector: '.tab' })).toHaveClass('active');
  });

  test('renders the supported administration tabs', async () => {
    listCodeSubmissions.mockResolvedValue({ submissions: [], counts: { pending: 0, approved: 0, rejected: 0 } });
    render(<AdminPage />);
    expect(await screen.findByText('No code submissions')).toBeInTheDocument();
    expect(screen.getByText('Code submissions')).toBeInTheDocument();
    expect(screen.queryByText('Submitter accounts')).not.toBeInTheDocument();

    listAdminDatasets.mockResolvedValue({ datasets: [], counts: { pending: 0, accepted: 0, rejected: 0, test: 0, deleted: 0 } });
    fireEvent.click(screen.getByText('Dataset Submissions', { selector: '.tab' }));
    expect(await screen.findByText('No datasets')).toBeInTheDocument();
    expect(listAdminDatasets).toHaveBeenCalledWith('pending');

    for (const label of ['API Keys', 'Dataset Releases', 'API Versions', 'Reconciliation']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  test('does not embed a video when no race catalogue can be loaded', async () => {
    getTelemetryTVRaces.mockRejectedValue(new Error('catalogue unavailable'));
    // The page renders router links (the race picker's sync entry point),
    // so it needs a Router context like every other page test.
    render(
      <MemoryRouter>
        <TelemetryTVPage />
      </MemoryRouter>
    );
    // A failed catalogue leaves the page on the guide, which names the error
    // and never mounts a player.
    expect(await screen.findByText('catalogue unavailable')).toBeInTheDocument();
    expect(screen.queryByTitle('YouTube video player')).not.toBeInTheDocument();
  });
});
