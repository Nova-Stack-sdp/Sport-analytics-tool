import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SubmissionsPanel from '../components/developer/SubmissionsPanel';
import { submitData, listSubmissions } from '../api/client';

jest.mock('../api/client', () => ({
  submitData: jest.fn(),
  listSubmissions: jest.fn(),
  reviewSubmission: jest.fn(),
}));
// The panel may read the signed-in user's role; these tests are about the
// dataset purpose, so render as a developer without touching Firebase.
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ isAdmin: false }),
}));

async function submitAs(purposeLabel) {
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '11230' } });
  if (purposeLabel) {
    fireEvent.change(screen.getByRole('combobox'), { target: { value: purposeLabel } });
  }
  fireEvent.click(screen.getByRole('button', { name: /submit batch/i }));
}

describe('SubmissionsPanel — dataset purpose', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listSubmissions.mockResolvedValue({ submissions: [] });
  });

  test('defaults to race data and leaves purpose to the backend default', async () => {
    submitData.mockResolvedValue({ submissionId: 's1', status: 'pending', purpose: 'race_data', eventsWritten: 0, rejections: [] });
    render(<SubmissionsPanel />);

    expect(screen.getByRole('combobox')).toHaveValue('race_data');
    await submitAs();

    await waitFor(() => expect(submitData).toHaveBeenCalledWith({ laps: [], session_key: 11230 }));
  });

  test('test data is sent as code_test and the result explains it is not added to the event log', async () => {
    submitData.mockResolvedValue({
      submissionId: 's2', status: 'pending', purpose: 'code_test', validRecords: 4, eventsWritten: 0, rejections: [],
    });
    render(<SubmissionsPanel />);

    await submitAs('code_test');

    await waitFor(() => expect(submitData).toHaveBeenCalledWith({ laps: [], session_key: 11230, purpose: 'code_test' }));
    expect(await screen.findByText(/4 valid record\(s\) checked; test data is kept for review but not added to the event log/)).toBeInTheDocument();
  });

  test('the list marks test data and datasets an admin deleted', async () => {
    listSubmissions.mockResolvedValue({
      submissions: [
        { id: 'a', sessionId: 'session-a', status: 'pending', purpose: 'code_test', deletedAt: null, submittedAt: '2026-10-08T10:00:00Z' },
        { id: 'b', sessionId: 'session-b', status: 'pending', purpose: 'race_data', deletedAt: '2026-10-09T10:00:00Z', submittedAt: '2026-10-08T09:00:00Z' },
      ],
    });
    render(<SubmissionsPanel />);

    expect(await screen.findByText('Test data')).toBeInTheDocument();
    expect(screen.getByText('Deleted by admin')).toBeInTheDocument();
  });
});
