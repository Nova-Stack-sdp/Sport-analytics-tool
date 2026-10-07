import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CodeSubmissionPage from '../pages/CodeSubmissionPage';
import { submitCodeSubmission } from '../api/client';

jest.mock('../api/client', () => ({
  submitCodeSubmission: jest.fn(),
}));

function httpError(status, body) {
  const err = new Error(`Request to /api/code-submissions failed with status ${status}`);
  err.status = status;
  err.body = body;
  return err;
}

const VALID_CODE = 'export function tyreDelta(stints) {\n  return stints.map((s) => s.delta);\n}';

// The field is labelled with the question the form asks, so tests query it
// verbatim.
const TITLE_LABEL = 'What should this stat be called?';

function fill(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

// Tags are deliberately not part of this form — it collects the stat's name,
// language, script, and description only.
function fillValidDraft() {
  fill(TITLE_LABEL, '  Tyre delta per stint  ');
  fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'JavaScript' } });
  fill('Code', VALID_CODE);
  fill('Description (optional)', '  Lap-time delta per stint.  ');
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /submit script/i }));
}

describe('CodeSubmissionPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders the form with every field and the allowed languages', () => {
    render(<CodeSubmissionPage />);

    expect(screen.getByLabelText(TITLE_LABEL)).toBeInTheDocument();
    expect(screen.getByLabelText('Language')).toBeInTheDocument();
    expect(screen.getByLabelText('Code')).toBeInTheDocument();
    expect(screen.getByLabelText('Description (optional)')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Select a language…' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'JavaScript' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Python' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Ruby' })).not.toBeInTheDocument();

    // The right card teaches the post-submit flow (review → status → notification).
    expect(screen.getByText('After you submit')).toBeInTheDocument();
    expect(screen.getByText("Waiting for the admin's decision.")).toBeInTheDocument();
  });

  test('offers an inert escape hatch for unlisted languages', () => {
    render(<CodeSubmissionPage />);

    // Placeholder until the unlisted-language flow is decided: the option is
    // visible but disabled, so choosing it can't change the selection. The
    // wording is the user's own ("Language not above?") — don't tidy it.
    expect(screen.getByRole('option', { name: 'Language not above?' })).toBeDisabled();
  });

  test('blocks an invalid draft in the browser and never calls the API', () => {
    render(<CodeSubmissionPage />);
    fill(TITLE_LABEL, 'Tyre delta per stint');
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'JavaScript' } });
    // Code left empty on purpose.

    submit();

    expect(screen.getByText(/fix these before submitting/i)).toBeInTheDocument();
    expect(screen.getByText('Code is required.')).toBeInTheDocument();
    expect(screen.getByText('code')).toBeInTheDocument();
    expect(submitCodeSubmission).not.toHaveBeenCalled();
  });

  test('lists every format problem at once when the form is empty', () => {
    render(<CodeSubmissionPage />);

    submit();

    expect(screen.getByText('Title is required.')).toBeInTheDocument();
    expect(screen.getByText('Language is required.')).toBeInTheDocument();
    expect(screen.getByText('Code is required.')).toBeInTheDocument();
    expect(submitCodeSubmission).not.toHaveBeenCalled();
  });

  test('clears the validation complaints as soon as a field changes', () => {
    render(<CodeSubmissionPage />);

    submit();
    expect(screen.getByText('Title is required.')).toBeInTheDocument();

    fill(TITLE_LABEL, 'Tyre delta per stint');

    expect(screen.queryByText('Title is required.')).not.toBeInTheDocument();
    expect(screen.queryByText(/fix these before submitting/i)).not.toBeInTheDocument();
  });

  test('submits the normalized payload when the draft passes the format check', async () => {
    submitCodeSubmission.mockResolvedValue({ id: 'cs_1', status: 'pending' });
    render(<CodeSubmissionPage />);

    fillValidDraft();
    submit();

    await waitFor(() => expect(submitCodeSubmission).toHaveBeenCalledTimes(1));
    // No tags field, but the POST body contract still carries the key —
    // normalizeSubmission() fills in the empty array.
    expect(submitCodeSubmission).toHaveBeenCalledWith({
      title: 'Tyre delta per stint',
      language: 'JavaScript',
      code: VALID_CODE,
      description: 'Lap-time delta per stint.',
      tags: [],
    });
  });

  test('keeps the button busy while the request is in flight', async () => {
    let resolveSubmit;
    submitCodeSubmission.mockImplementation(
      () => new Promise((resolve) => { resolveSubmit = resolve; })
    );
    render(<CodeSubmissionPage />);

    fillValidDraft();
    submit();

    const button = screen.getByRole('button', { name: /submitting…/i });
    expect(button).toBeDisabled();

    resolveSubmit({ id: 'cs_2', status: 'pending' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /submit script/i })).toBeEnabled()
    );
  });

  test('shows the confirmation with the submission id on success', async () => {
    submitCodeSubmission.mockResolvedValue({ id: 'cs_123', status: 'pending' });
    render(<CodeSubmissionPage />);

    fillValidDraft();
    submit();

    expect(await screen.findByText(/✓ Submitted/)).toBeInTheDocument();
    expect(screen.getByText('cs_123')).toBeInTheDocument();
    // The success surface shows the brand-new status ("pending" also appears in
    // the right card's status legend, so scope the query to the box itself).
    const success = screen.getByText(/✓ Submitted/).closest('.cs-success');
    expect(within(success).getByText('pending')).toBeInTheDocument();
  });

  test('shows an auth error instead of a fake success on 401', async () => {
    submitCodeSubmission.mockRejectedValue(httpError(401, { error: 'Invalid or expired token' }));
    render(<CodeSubmissionPage />);

    fillValidDraft();
    submit();

    expect(await screen.findByText(/need to be signed in/i)).toBeInTheDocument();
    expect(screen.queryByText(/✓ Submitted/)).not.toBeInTheDocument();
  });

  test("surfaces the backend's own message for other failures (e.g. 403)", async () => {
    submitCodeSubmission.mockRejectedValue(httpError(403, { error: 'Developer access required' }));
    render(<CodeSubmissionPage />);

    fillValidDraft();
    submit();

    expect(await screen.findByText(/Developer access required/)).toBeInTheDocument();
  });
});
