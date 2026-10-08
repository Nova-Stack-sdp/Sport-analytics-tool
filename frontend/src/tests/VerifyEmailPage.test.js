import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VerifyEmailPage from '../pages/VerifyEmailPage';

// AuthContext owns the session, the verified flag and the two backend calls;
// PreferencesContext only supplies the landing page after a good code. Both
// are controlled here so the page is exercised on its own.
const mockRequestEmailCode = jest.fn();
const mockConfirmEmailCode = jest.fn();
let mockAuthState;

jest.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('../context/PreferencesContext', () => ({
  usePreferences: () => ({ preferences: { startPage: '/overview' } }),
}));

// What api/client throws: an Error carrying the status and the parsed body,
// which is where the backend's `code` lives (see api/client.js request()).
function httpError(status, body) {
  return Object.assign(new Error(`Request failed with status ${status}`), { status, body });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/verify-email']}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/overview" element={<div>Overview page</div>} />
        <Route path="/sign-in" element={<div>Sign in page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const sentResponse = {
  status: 'sent',
  email: 'an***@example.test',
  expiresInMinutes: 10,
  resendAfterSeconds: 60,
};

// The countdown chains one timeout per tick, so the next timer only exists
// after React has committed the previous one — one act() per second.
async function tickCountdown(seconds) {
  for (let tick = 0; tick < seconds; tick += 1) {
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
  }
}

beforeEach(() => {
  mockRequestEmailCode.mockReset();
  mockRequestEmailCode.mockResolvedValue(sentResponse);
  mockConfirmEmailCode.mockReset();
  mockConfirmEmailCode.mockResolvedValue({ status: 'verified', emailVerified: true });
  mockAuthState = {
    user: { uid: 'u1', email: 'ana@example.test' },
    loading: false,
    emailVerified: false,
    requestEmailCode: mockRequestEmailCode,
    confirmEmailCode: mockConfirmEmailCode,
  };
});

describe('VerifyEmailPage', () => {
  test('mails a code as soon as the page opens', async () => {
    renderPage();

    await waitFor(() => expect(mockRequestEmailCode).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Verification code')).toBeInTheDocument();
    expect(await screen.findByText(/enter the code we sent to/i)).toBeInTheDocument();
    expect(screen.getByText('ana@example.test')).toBeInTheDocument();
  });

  test('shows the code itself while the console mail provider is on', async () => {
    mockRequestEmailCode.mockResolvedValue({ ...sentResponse, devCode: '040021' });
    renderPage();

    expect(await screen.findByText(/dev only/i)).toBeInTheDocument();
    expect(screen.getByText('040021')).toBeInTheDocument();
  });

  test('never shows a dev code when the backend does not send one', async () => {
    renderPage();

    await waitFor(() => expect(mockRequestEmailCode).toHaveBeenCalled());
    expect(screen.queryByText(/dev only/i)).not.toBeInTheDocument();
  });

  test('holds the resend button until the cooldown runs out, then unlocks it', async () => {
    jest.useFakeTimers();
    try {
      renderPage();
      await act(async () => {}); // let the auto-send response land

      const resend = screen.getByRole('button', { name: 'Send a new code' });
      expect(resend).toBeDisabled();
      expect(screen.getByText(/in 60s/)).toBeInTheDocument();

      await tickCountdown(60);

      expect(screen.getByRole('button', { name: 'Send a new code' })).not.toBeDisabled();
      expect(mockRequestEmailCode).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('treats a refusal inside the cooldown as a code already sent, not as an error', async () => {
    // What the backend answers when the page is reopened a few seconds after a
    // code went out: the one in the inbox is still valid.
    mockRequestEmailCode.mockRejectedValue(
      httpError(429, { code: 'RESEND_COOLDOWN', retryAfterSeconds: 42 })
    );
    renderPage();

    expect(await screen.findByText(/in 42s/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('surfaces the daily send limit instead of pretending a code is coming', async () => {
    mockRequestEmailCode.mockRejectedValue(httpError(429, { code: 'DAILY_LIMIT' }));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/too many codes in the last 24 hours/i);
  });

  test('reports a mail outage and leaves the resend available', async () => {
    mockRequestEmailCode.mockRejectedValue(httpError(502, { code: 'EMAIL_SEND_FAILED' }));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't send the code/i);
    expect(screen.getByRole('button', { name: 'Send a new code' })).not.toBeDisabled();
  });

  test('rejects a code that is not six digits without calling the backend', async () => {
    renderPage();
    await waitFor(() => expect(mockRequestEmailCode).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));

    expect(await screen.findByText('Enter the 6-digit code from the email.')).toBeInTheDocument();
    expect(mockConfirmEmailCode).not.toHaveBeenCalled();
  });

  test('shows how many tries are left when the code is wrong', async () => {
    mockConfirmEmailCode.mockRejectedValue(
      httpError(400, {
        code: 'CODE_MISMATCH',
        error: 'That code is not correct. 4 tries left.',
        attemptsRemaining: 4,
      })
    );
    renderPage();
    await waitFor(() => expect(mockRequestEmailCode).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));

    expect(await screen.findByText('That code is not correct. 4 tries left.')).toBeInTheDocument();
  });

  test('explains an expired code with the backend\'s own wording replaced by a clearer one', async () => {
    mockConfirmEmailCode.mockRejectedValue(httpError(410, { code: 'CODE_EXPIRED' }));
    renderPage();
    await waitFor(() => expect(mockRequestEmailCode).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));

    expect(await screen.findByText('That code has expired. Ask for a new one.')).toBeInTheDocument();
  });

  test('verifies the account and lands on the start page', async () => {
    renderPage();
    await waitFor(() => expect(mockRequestEmailCode).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));

    await waitFor(() => expect(mockConfirmEmailCode).toHaveBeenCalledWith('123456'));
    expect(await screen.findByText('Overview page')).toBeInTheDocument();
  });

  test('a second send is asked for by hand once the cooldown has passed', async () => {
    mockRequestEmailCode.mockResolvedValue({ ...sentResponse, resendAfterSeconds: 0 });
    renderPage();

    // Wait for the sent state itself, not just the call: the button is disabled
    // while the first request is still in flight.
    await screen.findByText('Nothing arrived?');
    fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }));

    await waitFor(() => expect(mockRequestEmailCode).toHaveBeenCalledTimes(2));
  });

  test('follows a code verified in another tab rather than asking for a new one', async () => {
    mockRequestEmailCode.mockResolvedValue({ status: 'already-verified', emailVerified: true });
    renderPage();

    expect(await screen.findByText('Overview page')).toBeInTheDocument();
    expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument();
  });

  test('redirects an account that is already verified without mailing anything', async () => {
    mockAuthState = { ...mockAuthState, emailVerified: true };
    renderPage();

    expect(await screen.findByText('Overview page')).toBeInTheDocument();
    expect(mockRequestEmailCode).not.toHaveBeenCalled();
  });

  test('sends a signed-out visitor to sign-in', async () => {
    mockAuthState = { ...mockAuthState, user: null };
    renderPage();

    expect(await screen.findByText('Sign in page')).toBeInTheDocument();
    expect(mockRequestEmailCode).not.toHaveBeenCalled();
  });
});
