import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CodeSubmissionsPanel from '../components/admin/CodeSubmissionsPanel';
import { listCodeSubmissions, reviewCodeSubmission } from '../api/client';

jest.mock('../api/client', () => ({
  listCodeSubmissions: jest.fn(),
  reviewCodeSubmission: jest.fn(),
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

    await waitFor(() => expect(listCodeSubmissions).toHaveBeenCalledWith('accepted'));
    await screen.findByText('No code submissions');
  });

  test('approves a pending submission and reloads the queue', async () => {
    listCodeSubmissions.mockResolvedValue({ submissions: [submission()] });
    reviewCodeSubmission.mockResolvedValue({ id: 'cs_1', status: 'accepted' });
    render(<CodeSubmissionsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(reviewCodeSubmission).toHaveBeenCalledWith('cs_1', 'accepted'));
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
        submission({ id: 'cs_2', status: 'accepted', title: 'Pit loss model' }),
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
});
