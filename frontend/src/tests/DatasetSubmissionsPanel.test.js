import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DatasetSubmissionsPanel from '../components/admin/DatasetSubmissionsPanel';
import {
  listAdminDatasets,
  getAdminDataset,
  downloadAdminDataset,
  deleteAdminDataset,
  restoreAdminDataset,
  reviewSubmission,
} from '../api/client';

jest.mock('../api/client', () => ({
  listAdminDatasets: jest.fn(),
  getAdminDataset: jest.fn(),
  downloadAdminDataset: jest.fn(),
  deleteAdminDataset: jest.fn(),
  restoreAdminDataset: jest.fn(),
  reviewSubmission: jest.fn(),
}));

const COUNTS = { pending: 1, accepted: 2, rejected: 0, test: 1, deleted: 0 };

function dataset(overrides = {}) {
  return {
    id: 'sub-1',
    purpose: 'race_data',
    status: 'pending',
    submitterId: 'dev-uid',
    submittedAt: '2026-10-08T10:00:00.000Z',
    reviewedBy: null,
    reviewedAt: null,
    deletedAt: null,
    deletedBy: null,
    session: { id: 's1', sessionKey: 9999, type: 'Race', meetingName: 'Italian Grand Prix', season: 2026 },
    validRecords: 3,
    rejectedRecords: 1,
    eventCount: 3,
    hasOriginalUpload: true,
    uploadSizeBytes: 512,
    ...overrides,
  };
}

function httpError(status, body) {
  const err = new Error(`Request failed with status ${status}`);
  err.status = status;
  err.body = body;
  return err;
}

describe('DatasetSubmissionsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listAdminDatasets.mockResolvedValue({ view: 'pending', datasets: [dataset()], counts: COUNTS });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    window.confirm.mockRestore();
  });

  test('shows a retryable error without an empty queue on failure', async () => {
    listAdminDatasets.mockRejectedValueOnce(new Error('Service unavailable'));
    render(<DatasetSubmissionsPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
    expect(screen.queryByText('No datasets')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Italian Grand Prix · Race 2026')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('loads the pending queue with tab counts and the row details', async () => {
    render(<DatasetSubmissionsPanel />);

    expect(await screen.findByText('Italian Grand Prix · Race 2026')).toBeInTheDocument();
    expect(listAdminDatasets).toHaveBeenCalledWith('pending');
    expect(screen.getByText('Accepted (2)')).toBeInTheDocument();
    expect(screen.getByText('Test data (1)')).toBeInTheDocument();
    expect(screen.getByText('session_key 9999')).toBeInTheDocument();
    expect(screen.getByText('3 valid · 1 rejected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  test('accepting race data reviews it and reloads the queue', async () => {
    reviewSubmission.mockResolvedValue({ submissionId: 'sub-1', status: 'accepted' });
    render(<DatasetSubmissionsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(reviewSubmission).toHaveBeenCalledWith('sub-1', 'accepted'));
    expect(await screen.findByRole('status')).toHaveTextContent('accepted. Its events now count toward statistics.');
    expect(listAdminDatasets).toHaveBeenCalledTimes(2);
  });

  test('test data and accepted data offer no Accept/Reject', async () => {
    listAdminDatasets.mockResolvedValue({
      datasets: [dataset({ id: 't1', purpose: 'code_test' }), dataset({ id: 'a1', status: 'accepted' })],
      counts: COUNTS,
    });
    render(<DatasetSubmissionsPanel />);

    expect(await screen.findByText('Test data', { selector: '.pill' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });

  test('deleting asks first, warns about statistics for accepted data, and reports the recompute', async () => {
    listAdminDatasets.mockResolvedValue({ datasets: [dataset({ status: 'accepted' })], counts: COUNTS });
    deleteAdminDataset.mockResolvedValue({ id: 'sub-1', statisticsRecalculated: true });
    render(<DatasetSubmissionsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/statistics for this session will be recalculated/));
    await waitFor(() => expect(deleteAdminDataset).toHaveBeenCalledWith('sub-1'));
    expect(await screen.findByRole('status')).toHaveTextContent('Dataset deleted. Statistics recalculated.');
  });

  test('cancelling the confirmation deletes nothing', async () => {
    window.confirm.mockReturnValue(false);
    render(<DatasetSubmissionsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(deleteAdminDataset).not.toHaveBeenCalled();
  });

  test('shows the backend warning when the delete was saved but the recompute failed', async () => {
    deleteAdminDataset.mockResolvedValue({ id: 'sub-1', statisticsRecalculated: false, warning: 'recalculating statistics failed' });
    render(<DatasetSubmissionsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Deleted, but: recalculating statistics failed');
  });

  test('the Deleted tab offers Restore instead of Delete', async () => {
    listAdminDatasets.mockImplementation(async (view) => ({
      datasets: view === 'deleted' ? [dataset({ deletedAt: '2026-10-09T08:00:00.000Z', deletedBy: 'admin-uid' })] : [],
      counts: { ...COUNTS, deleted: 1 },
    }));
    restoreAdminDataset.mockResolvedValue({ id: 'sub-1', deletedAt: null, statisticsRecalculated: false });
    render(<DatasetSubmissionsPanel />);
    await screen.findByText('No datasets');

    fireEvent.click(screen.getByText('Deleted (1)'));

    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    await waitFor(() => expect(restoreAdminDataset).toHaveBeenCalledWith('sub-1'));
    expect(await screen.findByRole('status')).toHaveTextContent('Dataset restored.');
  });

  test('downloads the file and says when it is a rebuilt copy', async () => {
    const blob = new Blob(['{}'], { type: 'application/json' });
    downloadAdminDataset.mockResolvedValue({ blob, kind: 'rebuilt' });
    URL.createObjectURL = jest.fn(() => 'blob:fake');
    URL.revokeObjectURL = jest.fn();
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<DatasetSubmissionsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(downloadAdminDataset).toHaveBeenCalledWith('sub-1');
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    expect(screen.getByRole('status')).toHaveTextContent('Downloaded a rebuilt file');
    click.mockRestore();
  });

  test('View shows the rejected records and what the download will be', async () => {
    getAdminDataset.mockResolvedValue({
      ...dataset(),
      rejections: [{ eventType: 'lap_completed', reason: 'unknown driver_number 77' }],
      upload: { kind: 'original', sizeBytes: 2048, sha256: 'abcdef0123456789ff' },
    });
    render(<DatasetSubmissionsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'View' }));

    expect(await screen.findByText('unknown driver_number 77')).toBeInTheDocument();
    expect(screen.getByText('Original upload, 2.0 KB · SHA-256 abcdef012345…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument();
  });

  test('shows the backend error when an action is refused', async () => {
    reviewSubmission.mockRejectedValue(httpError(409, { error: 'Submission has been deleted; restore it before reviewing' }));
    render(<DatasetSubmissionsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('restore it before reviewing');
  });

  test('test data says which script it is for, or that it is not attached yet', async () => {
    listAdminDatasets.mockResolvedValue({
      datasets: [
        dataset({ id: 't1', purpose: 'code_test', usedBy: { codeSubmissionId: 'cs-1', title: 'Tyre delta', status: 'pending' } }),
        dataset({ id: 't2', purpose: 'code_test', usedBy: { codeSubmissionId: 'cs-2', title: 'Pit loss', status: 'approved', slug: 'pit-loss' } }),
        dataset({ id: 't3', purpose: 'code_test', usedBy: null }),
      ],
      counts: COUNTS,
    });
    render(<DatasetSubmissionsPanel />);

    expect(await screen.findByText('For “Tyre delta” (pending)')).toBeInTheDocument();
    expect(screen.getByText('For “Pit loss” (published)')).toBeInTheDocument();
    expect(screen.getByText('Not attached to any script yet')).toBeInTheDocument();
  });
});
