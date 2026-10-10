import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CodeSubmissionsPanel from '../components/admin/CodeSubmissionsPanel';
import {
  listCodeSubmissions, getCodeSubmission, reviewCodeSubmission, removePublishedCode, downloadAdminDataset,
} from '../api/client';
import { saveBlob } from '../utils/download';

jest.mock('../api/client', () => ({
  listCodeSubmissions: jest.fn(),
  getCodeSubmission: jest.fn(),
  reviewCodeSubmission: jest.fn(),
  removePublishedCode: jest.fn(),
  downloadAdminDataset: jest.fn(),
}));
jest.mock('../utils/download', () => ({
  ...jest.requireActual('../utils/download'),
  saveBlob: jest.fn(),
}));

function httpError(status, body) {
  const err = new Error(`Request to /api/code-submissions failed with status ${status}`);
  err.status = status;
  err.body = body;
  return err;
}

function submission(overrides = {}) {
  return {
    id: 'cs_1',
    title: 'Tyre delta per stint',
    language: 'JavaScript',
    submitterId: 'user-123',
    submittedAt: '2026-10-05T12:00:00.000Z',
    status: 'pending',
    ...overrides,
  };
}

describe('CodeSubmissionsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listCodeSubmissions.mockResolvedValue({ submissions: [] });
  });

  test('loads the pending queue for the default tab', async () => {
    listCodeSubmissions.mockResolvedValue({ submissions: [submission()] });
    render(<CodeSubmissionsPanel />);

    expect(await screen.findByText('Tyre delta per stint')).toBeInTheDocument();
    expect(listCodeSubmissions).toHaveBeenCalledWith('pending');
    expect(screen.getByText('JavaScript')).toBeInTheDocument();
    expect(screen.getByText('user-123')).toBeInTheDocument();
    // "Pending" appears twice: once as the tab, once as the row's pill.
    expect(screen.getAllByText('Pending')).toHaveLength(2);
  });

  test('shows the submitter email when there is one, and totals from the database counts', async () => {
    listCodeSubmissions.mockResolvedValue({
      submissions: [submission({ submitterEmail: 'dev@example.test' })],
      counts: { pending: 1, approved: 4, rejected: 2 },
    });
    render(<CodeSubmissionsPanel />);

    expect(await screen.findByText('dev@example.test')).toBeInTheDocument();
    expect(screen.getByText('Total').nextSibling).toHaveTextContent('7');
    expect(screen.getByText('Approved', { selector: '.l' }).nextSibling).toHaveTextContent('4');
  });

  test('loads and shows the submitted code on demand', async () => {
    listCodeSubmissions.mockResolvedValue({ submissions: [submission()] });
    getCodeSubmission.mockResolvedValue({ id: 'cs_1', code: 'const delta = 1;', description: 'Tyre wear per lap' });
    render(<CodeSubmissionsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'View code' }));

    expect(await screen.findByText('const delta = 1;')).toBeInTheDocument();
    expect(screen.getByText('Tyre wear per lap')).toBeInTheDocument();
    expect(getCodeSubmission).toHaveBeenCalledWith('cs_1');

    fireEvent.click(screen.getByRole('button', { name: 'Hide code' }));
    expect(screen.queryByText('const delta = 1;')).not.toBeInTheDocument();
  });

  test('shows an empty state instead of made-up rows', async () => {
    render(<CodeSubmissionsPanel />);

    expect(await screen.findByText('No code submissions')).toBeInTheDocument();
    expect(listCodeSubmissions).toHaveBeenCalledTimes(1);
  });

  test('surfaces a load error rather than an empty table', async () => {
    listCodeSubmissions.mockRejectedValue(httpError(401, { error: 'Invalid or expired token' }));
    render(<CodeSubmissionsPanel />);

    expect(await screen.findByText(/need to be signed in/i)).toBeInTheDocument();
    expect(screen.queryByText('No code submissions')).not.toBeInTheDocument();
  });

  test('falls back to the request message when the backend has no JSON body', async () => {
    // What an unwired backend (404 HTML page) produces today: no body, just status.
    listCodeSubmissions.mockRejectedValue(httpError(404, undefined));
    render(<CodeSubmissionsPanel />);

    expect(await screen.findByText('Request to /api/code-submissions failed with status 404')).toBeInTheDocument();
  });

  test('switching tabs refetches with that status', async () => {
    render(<CodeSubmissionsPanel />);
    await screen.findByText('No code submissions');

    fireEvent.click(screen.getByText('Approved'));

    await waitFor(() => expect(listCodeSubmissions).toHaveBeenCalledWith('approved'));
    await screen.findByText('No code submissions');
  });

  test('approves a pending submission and reloads the queue', async () => {
    listCodeSubmissions.mockResolvedValue({ submissions: [submission()] });
    reviewCodeSubmission.mockResolvedValue({ id: 'cs_1', status: 'approved' });
    render(<CodeSubmissionsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(reviewCodeSubmission).toHaveBeenCalledWith('cs_1', 'approved'));
    await waitFor(() => expect(listCodeSubmissions).toHaveBeenCalledTimes(2));
    expect(listCodeSubmissions).toHaveBeenLastCalledWith('pending');
  });

  test('rejects a pending submission and reloads the queue', async () => {
    listCodeSubmissions.mockResolvedValue({ submissions: [submission()] });
    reviewCodeSubmission.mockResolvedValue({ id: 'cs_1', status: 'rejected' });
    render(<CodeSubmissionsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));

    await waitFor(() => expect(reviewCodeSubmission).toHaveBeenCalledWith('cs_1', 'rejected'));
    await waitFor(() => expect(listCodeSubmissions).toHaveBeenCalledTimes(2));
  });

  test('shows the review error when the backend rejects the review', async () => {
    listCodeSubmissions.mockResolvedValue({ submissions: [submission()] });
    reviewCodeSubmission.mockRejectedValue(httpError(403, { error: 'Admin access required' }));
    render(<CodeSubmissionsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(await screen.findByText(/Admin access required/)).toBeInTheDocument();
  });

  test('offers no review actions on already-reviewed submissions', async () => {
    listCodeSubmissions.mockResolvedValue({
      submissions: [
        submission({ id: 'cs_2', status: 'approved', title: 'Pit loss model' }),
        submission({ id: 'cs_3', status: 'rejected', title: 'Grid predictor' }),
      ],
    });
    render(<CodeSubmissionsPanel />);

    expect(await screen.findByText('Pit loss model')).toBeInTheDocument();
    expect(screen.getByText('Grid predictor')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
    // "Approved"/"Rejected" each appear twice: once as the tab, once as the pill.
    expect(screen.getAllByText('Approved')).toHaveLength(2);
    expect(screen.getAllByText('Rejected')).toHaveLength(2);
  });

  test('after approving, says the script moved to the Approved tab', async () => {
    listCodeSubmissions.mockResolvedValue({ submissions: [submission()] });
    reviewCodeSubmission.mockResolvedValue({ id: 'cs_1', status: 'approved' });
    render(<CodeSubmissionsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(await screen.findByRole('status')).toHaveTextContent('“Tyre delta per stint” approved and moved to the Approved tab.');
  });

  test('after rejecting, mentions the 7-day retention', async () => {
    listCodeSubmissions.mockResolvedValue({ submissions: [submission()] });
    reviewCodeSubmission.mockResolvedValue({ id: 'cs_1', status: 'rejected' });
    render(<CodeSubmissionsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/rejected\. Rejected scripts are deleted automatically after 7 days/);
  });

  test('the notice clears when switching tabs', async () => {
    listCodeSubmissions.mockResolvedValue({ submissions: [submission()] });
    reviewCodeSubmission.mockResolvedValue({ id: 'cs_1', status: 'approved' });
    render(<CodeSubmissionsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await screen.findByRole('status');

    fireEvent.click(screen.getByText('Rejected'));

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  test('shows when a reviewed script was reviewed, and a dash while pending', async () => {
    listCodeSubmissions.mockResolvedValue({
      submissions: [
        submission({ id: 'cs_4', status: 'approved', title: 'Reviewed one', reviewedAt: '2026-10-06T09:30:00.000Z' }),
        submission({ id: 'cs_5', title: 'Still pending' }),
      ],
    });
    render(<CodeSubmissionsPanel />);

    expect(await screen.findByRole('columnheader', { name: 'Reviewed' })).toBeInTheDocument();
    expect(screen.getByText(new Date('2026-10-06T09:30:00.000Z').toLocaleString())).toBeInTheDocument();
    const pendingRow = screen.getByText('Still pending').closest('tr');
    expect(pendingRow).toHaveTextContent('—');
  });

  describe('test data and removal', () => {
    const approved = submission({ id: 'cs_9', status: 'approved', title: 'Pit loss model', verifiedCodeId: 'vc_9', testDatasetId: 'ds_1' });

    beforeEach(() => {
      jest.spyOn(window, 'confirm').mockReturnValue(true);
    });
    afterEach(() => window.confirm.mockRestore());

    test('marks scripts that came with test data', async () => {
      listCodeSubmissions.mockResolvedValue({ submissions: [submission({ testDatasetId: 'ds_1' })] });
      render(<CodeSubmissionsPanel />);
      expect(await screen.findByText('Test data', { selector: '.pill' })).toBeInTheDocument();
    });

    test('View code shows the attached test data and downloads it', async () => {
      listCodeSubmissions.mockResolvedValue({ submissions: [submission({ testDatasetId: 'ds_1' })] });
      getCodeSubmission.mockResolvedValue({
        id: 'cs_1', code: 'x', description: 'Tyre wear per lap',
        testDataset: { id: 'ds_1', sessionLabel: 'Italian Grand Prix · Race 2026', sessionKey: 9999, validRecords: 12, deleted: false },
      });
      const blob = new Blob(['{}']);
      downloadAdminDataset.mockResolvedValue({ blob, kind: 'original' });
      render(<CodeSubmissionsPanel />);

      fireEvent.click(await screen.findByRole('button', { name: 'View code' }));
      expect(await screen.findByText('Italian Grand Prix · Race 2026 · 12 valid record(s)')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Download test data' }));

      await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, 'dataset-ds_1.json'));
      expect(downloadAdminDataset).toHaveBeenCalledWith('ds_1');
    });

    test('says when no test data is attached', async () => {
      listCodeSubmissions.mockResolvedValue({ submissions: [submission()] });
      getCodeSubmission.mockResolvedValueOnce({ id: 'cs_1', code: 'x', testDataset: null });
      render(<CodeSubmissionsPanel />);
      fireEvent.click(await screen.findByRole('button', { name: 'View code' }));
      expect(await screen.findByText('None attached')).toBeInTheDocument();
    });

    test('Remove asks first, then takes approved code off the public API', async () => {
      listCodeSubmissions.mockResolvedValue({ submissions: [approved] });
      removePublishedCode.mockResolvedValue({ id: 'vc_9', slug: 'pit-loss-model', removed: true, testDataRetired: true });
      render(<CodeSubmissionsPanel />);

      fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

      expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/cannot be undone.*test data will be retired too/));
      await waitFor(() => expect(removePublishedCode).toHaveBeenCalledWith('vc_9'));
      expect(await screen.findByRole('status')).toHaveTextContent('“Pit loss model” removed from the public API. Its test data was retired');
      await waitFor(() => expect(listCodeSubmissions).toHaveBeenCalledTimes(2));
    });

    test('cancelling Remove does nothing; pending and rejected scripts have no Remove', async () => {
      window.confirm.mockReturnValue(false);
      listCodeSubmissions.mockResolvedValue({ submissions: [approved, submission({ id: 'cs_2' }), submission({ id: 'cs_3', status: 'rejected' })] });
      render(<CodeSubmissionsPanel />);

      const buttons = await screen.findAllByRole('button', { name: 'Remove' });
      expect(buttons).toHaveLength(1);
      fireEvent.click(buttons[0]);
      expect(removePublishedCode).not.toHaveBeenCalled();
    });

    test('rejecting a script with test data says its test data was retired', async () => {
      listCodeSubmissions.mockResolvedValue({ submissions: [submission({ testDatasetId: 'ds_1' })] });
      reviewCodeSubmission.mockResolvedValue({ id: 'cs_1', status: 'rejected' });
      render(<CodeSubmissionsPanel />);
      fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
      expect(await screen.findByRole('status')).toHaveTextContent('Its test data was retired with it.');
    });
  });
});
