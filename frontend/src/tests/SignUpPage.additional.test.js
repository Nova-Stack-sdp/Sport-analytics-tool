import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SignUpPage from '../pages/SignUpPage';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { confirmSignup, establishSession, requestSignupCode } from '../api/client';

// One mock set for the whole page: the code-request call, the code-confirm
// call that creates the account, and the sign-in that follows it. Getting
// into the code stage needs the first to resolve; nothing on this page
// creates an account by itself.
jest.mock('../firebase', () => ({
  auth: { currentUser: { getIdToken: () => Promise.resolve('id-token') } },
}));
jest.mock('firebase/auth', () => ({ signInWithEmailAndPassword: jest.fn() }));
jest.mock('../api/client', () => ({
  requestSignupCode: jest.fn(),
  confirmSignup: jest.fn(),
  establishSession: jest.fn(),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const sentResponse = {
  status: 'sent',
  email: 'ad***@example.com',
  expiresInMinutes: 10,
  resendAfterSeconds: 60,
};

// What api/client throws: an Error carrying the status and the parsed body,
// which is where the backend's `code` lives (see api/client.js request()).
function httpError(status, body) {
  return Object.assign(new Error(`Request failed with status ${status}`), { status, body });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SignUpPage />
    </MemoryRouter>
  );
}

function fill(values = {}) {
  const fields = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    password: 'password123',
    confirmPassword: 'password123',
    ...values,
  };
  const inputs = document.querySelectorAll('.auth-form input');
  [fields.firstName, fields.lastName, fields.email, fields.password, fields.confirmPassword]
    .forEach((value, index) => fireEvent.change(inputs[index], { target: { value } }));
}

/** Fill the form, submit, and wait for the code stage (real timers). */
async function reachCodeStage() {
  renderPage();
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await screen.findByLabelText('Verification code');
}

/** The same trip for fake-timer tests: one act() flushes the send response. */
async function reachCodeStageWithFakeTimers() {
  renderPage();
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await act(async () => {});
}

function enterCode(code) {
  fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and create account' }));
}

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
  jest.clearAllMocks();
  requestSignupCode.mockResolvedValue(sentResponse);
  confirmSignup.mockResolvedValue({ status: 'created', email: 'ada@example.com' });
  establishSession.mockResolvedValue({});
});

describe('SignUpPage additional validation and error states', () => {
  test('shows every client-side validation message and asks the backend for nothing', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Enter your first name')).toBeInTheDocument();
    expect(screen.getByText('Enter your last name')).toBeInTheDocument();
    expect(screen.getByText('Enter your email')).toBeInTheDocument();
    expect(screen.getByText('Choose a password')).toBeInTheDocument();

    fill({ email: 'invalid', password: 'short', confirmPassword: 'other' });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
    expect(screen.getByText("Passwords don't match")).toBeInTheDocument();
    expect(requestSignupCode).not.toHaveBeenCalled();
  });

  test.each([
    [429, 'DAILY_LIMIT', 'You have asked for too many codes in the last 24 hours. Try again later.'],
    [400, 'INVALID_EMAIL', 'Enter a valid email.'],
    [502, 'EMAIL_SEND_FAILED', "We couldn't send the code just now. Please try again."],
  ])('maps a %i %s refusal to a message about the request, never the account', async (status, code, message) => {
    requestSignupCode.mockRejectedValue(httpError(status, { code }));
    renderPage();
    fill();

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    // The form stays put — no code stage for a send that never happened.
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument();
  });

  test('maps an unexpected send failure to the same generic line', async () => {
    requestSignupCode.mockRejectedValue(new Error('network down'));
    renderPage();
    fill();

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't send the code just now. Please try again."
    );
  });

  test('keeps the form submitting until the code request lands', async () => {
    let finishSend;
    requestSignupCode.mockReturnValue(new Promise((resolve) => { finishSend = resolve; }));
    renderPage();
    fill();

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByRole('button', { name: 'Sending code…' })).toBeDisabled();
    expect(screen.getByLabelText('First name')).toBeDisabled();

    finishSend(sentResponse);
    await waitFor(() => expect(screen.getByLabelText('Verification code')).toBeInTheDocument());
  });

  test('treats a refusal inside the cooldown as a code already sent, not as an error', async () => {
    // What the backend answers when the submit arrives while the code it
    // sent a moment ago is still live: show the code step and run the timer
    // rather than claiming the request failed.
    requestSignupCode.mockRejectedValue(
      httpError(429, { code: 'RESEND_COOLDOWN', retryAfterSeconds: 42 })
    );
    renderPage();
    fill();

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByLabelText('Verification code')).toBeInTheDocument();
    expect(screen.getByText('ad***@example.com')).toBeInTheDocument();
    expect(screen.getByText(/in 42s/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('shows the code itself while the console mail provider is on', async () => {
    requestSignupCode.mockResolvedValue({ ...sentResponse, devCode: '040021' });
    await reachCodeStage();

    expect(screen.getByRole('status')).toHaveTextContent(/dev only/i);
    expect(screen.getByText('040021')).toBeInTheDocument();
  });

  test('holds the resend button until the cooldown runs out, then lets a new code through', async () => {
    jest.useFakeTimers();
    try {
      await reachCodeStageWithFakeTimers();

      const resend = () => screen.getByRole('button', { name: 'Send a new code' });
      expect(resend()).toBeDisabled();
      expect(screen.getByText(/in 60s/)).toBeInTheDocument();

      await tickCountdown(60);

      expect(resend()).not.toBeDisabled();
      expect(screen.getByText('Nothing arrived?')).toBeInTheDocument();
      expect(requestSignupCode).toHaveBeenCalledTimes(1);

      fireEvent.click(resend());
      await act(async () => {});
      expect(requestSignupCode).toHaveBeenCalledTimes(2);
      // The fresh code restarts the timer.
      expect(resend()).toBeDisabled();
      expect(screen.getByText(/in 60s/)).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test('a refused resend restarts the timer instead of showing an error', async () => {
    requestSignupCode.mockResolvedValueOnce({ ...sentResponse, resendAfterSeconds: 0 });
    await reachCodeStage();

    const resend = screen.getByRole('button', { name: 'Send a new code' });
    expect(resend).not.toBeDisabled();

    requestSignupCode.mockRejectedValueOnce(
      httpError(429, { code: 'RESEND_COOLDOWN', retryAfterSeconds: 42 })
    );
    fireEvent.click(resend);

    await waitFor(() => expect(screen.getByText(/in 42s/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Send a new code' })).toBeDisabled();
    expect(screen.queryByText(/couldn't send/i)).not.toBeInTheDocument();
  });

  test.each([
    ['NO_PENDING_SIGNUP', 'No sign-up is waiting for this email. Ask for a new code.'],
    ['CODE_EXPIRED', 'That code has expired. Ask for a new one.'],
    ['TOO_MANY_ATTEMPTS', 'Too many wrong guesses. Ask for a new one.'],
    ['EMAIL_EXISTS', 'An account with this email already exists. Sign in instead.'],
    ['WEAK_PASSWORD', 'Choose a password with at least 8 characters.'],
  ])('shows %s at the code step and never signs anyone in', async (code, message) => {
    confirmSignup.mockRejectedValue(httpError(400, { code }));
    await reachCodeStage();

    enterCode('123456');

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('maps an unexpected confirm failure to the generic line', async () => {
    confirmSignup.mockRejectedValue(new Error('gateway timeout'));
    await reachCodeStage();

    enterCode('123456');

    expect(
      await screen.findByText("We couldn't create your account. Please try again.")
    ).toBeInTheDocument();
  });

  test('refuses a code that is not six digits without asking the backend', async () => {
    await reachCodeStage();

    enterCode('12');

    expect(await screen.findByText('Enter the 6-digit code from the email.')).toBeInTheDocument();
    expect(confirmSignup).not.toHaveBeenCalled();
  });

  test('keeps the details so a wrong address is one edit away', async () => {
    await reachCodeStage();

    fireEvent.click(screen.getByRole('button', { name: 'Edit and try again' }));

    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveValue('ada@example.com');
    expect(screen.getByLabelText(/^password$/i)).toHaveValue('password123');
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Ada');

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByLabelText('Verification code');
    expect(requestSignupCode).toHaveBeenCalledTimes(2);
    expect(requestSignupCode).toHaveBeenLastCalledWith('ada@example.com');
  });

  test('each password eye toggles its own field between hidden and visible', async () => {
    renderPage();
    fill();

    const inputs = document.querySelectorAll('.auth-form input');
    const password = inputs[3];
    const confirm = inputs[4];
    expect(password).toHaveAttribute('type', 'password');
    expect(confirm).toHaveAttribute('type', 'password');

    const [passwordEye, confirmEye] = screen.getAllByRole('button', { name: 'Show password' });

    fireEvent.click(passwordEye);
    expect(password).toHaveAttribute('type', 'text');
    expect(password).toHaveValue('password123');
    // The confirm field has its own eye: revealing one must not reveal both.
    expect(confirm).toHaveAttribute('type', 'password');

    fireEvent.click(confirmEye);
    expect(confirm).toHaveAttribute('type', 'text');

    fireEvent.click(confirmEye);
    expect(confirm).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('type', 'text');
  });
});
