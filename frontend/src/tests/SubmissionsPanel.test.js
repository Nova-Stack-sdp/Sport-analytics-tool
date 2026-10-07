import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SubmissionsPanel from '../components/developer/SubmissionsPanel';
import { submitData, listSubmissions } from '../api/client';

jest.mock('../api/client', () => ({
  submitData: jest.fn(),
  listSubmissions: jest.fn(),
  reviewSubmission: jest.fn(),
}));

function httpError(status, body) {
  const err = new Error(`Request to /api/submissions failed with status ${status}`);
  err.status = status;
  err.body = body;
  return err;
}

async function submit(sessionKey = '11230') {
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: sessionKey } });
  fireEvent.click(screen.getByRole('button', { name: /submit batch/i }));
}

describe('SubmissionsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listSubmissions.mockResolvedValue({ submissions: [] });
  });

  test('shows an auth error instead of a fake "✓ undefined" success on 401', async () => {
    submitData.mockRejectedValue(httpError(401, { error: 'Invalid or expired token' }));
    render(<SubmissionsPanel />);
    await submit();

    expect(await screen.findByText(/need to be signed in/i)).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });

  test("surfaces the backend's own message for other failures (e.g. 403, 404)", async () => {
    submitData.mockRejectedValue(httpError(403, { error: 'Developer or admin access required to submit data' }));
    render(<SubmissionsPanel />);
    await submit();

    expect(await screen.findByText(/Developer or admin access required/)).toBeInTheDocument();
  });

  test('still renders a 422 schema rejection as a result with its reasons', async () => {
    submitData.mockRejectedValue(httpError(422, {
      submissionId: 's1',
      status: 'rejected',
      eventsWritten: 0,
      rejections: [{ eventType: 'lap', reason: 'Unknown driver_number 99' }],
    }));
    render(<SubmissionsPanel />);
    await submit();

    expect(await screen.findByText(/⚠ Rejected/)).toBeInTheDocument();
    expect(screen.getByText('Unknown driver_number 99')).toBeInTheDocument();
  });

  test('shows a pending result on success', async () => {
    submitData.mockResolvedValue({ submissionId: 's2', status: 'pending', eventsWritten: 2, rejections: [] });
    render(<SubmissionsPanel />);
    await submit();

    expect(await screen.findByText(/pending — 2 event\(s\) written/)).toBeInTheDocument();
    await waitFor(() => expect(submitData).toHaveBeenCalledWith({ laps: [], session_key: 11230 }));
  });
});
