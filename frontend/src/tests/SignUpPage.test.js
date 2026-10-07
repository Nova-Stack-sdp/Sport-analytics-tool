import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SignUpPage from '../pages/SignUpPage';
import { PreferencesProvider } from '../context/PreferencesContext';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { confirmSignup, establishSession, requestSignupCode } from '../api/client';

// The page's job ends where the backend's begins: it asks for a code
// (requestSignupCode), and only the call that carries that code back
// (confirmSignup) can create anything. There is deliberately no
// createUserWithEmailAndPassword anywhere — the account must not exist until
// the address has proved itself — so these tests mock the two backend calls
// plus the ordinary sign-in that follows a confirmed account.
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

// What the backend answers after mailing the code (see routes/signup.js).
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

function fillValidForm() {
  fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Ada' } });
  fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Lovelace' } });
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'ada@example.com' } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'longenough1' } });
  fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'longenough1' } });
}

/** Fill the form and land on the code stage, ready for the six digits. */
async function reachCodeStage() {
  renderPage();
  fillValidForm();
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await screen.findByLabelText('Verification code');
}

function enterCode(code) {
  fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and create account' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  requestSignupCode.mockResolvedValue(sentResponse);
  confirmSignup.mockResolvedValue({ status: 'created', email: 'ada@example.com' });
  establishSession.mockResolvedValue({});
});

describe('SignUpPage', () => {
  test('rejects mismatched passwords without asking the backend for anything', async () => {
    renderPage();
    fillValidForm();
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'something' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(/don't match/i)).toBeInTheDocument();
    expect(requestSignupCode).not.toHaveBeenCalled();
  });

  test('mails a code instead of creating the account — nothing exists yet', async () => {
    renderPage();
    fillValidForm();

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByLabelText('Verification code')).toBeInTheDocument();
    expect(requestSignupCode).toHaveBeenCalledWith('ada@example.com');
    // The address the code went to is named (masked), and the account half
    // of the pair has not run: no account, no session, no navigation.
    expect(screen.getByText('ad***@example.com')).toBeInTheDocument();
    expect(confirmSignup).not.toHaveBeenCalled();
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
    expect(establishSession).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    // The details form is gone — the password now lives only in this page's
    // memory, waiting for the confirm.
    expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeInTheDocument();
  });

  test('creates the account only after the code checks out, then signs in', async () => {
    signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1' } });

    await reachCodeStage();
    enterCode('123456');

    await waitFor(() =>
      expect(confirmSignup).toHaveBeenCalledWith({
        email: 'ada@example.com',
        code: '123456',
        password: 'longenough1',
        firstName: 'Ada',
        lastName: 'Lovelace',
      })
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/overview', { replace: true }));

    // The account is created first; the sign-in uses the password from the
    // form, and the backend session is established last of all.
    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(),
      'ada@example.com',
      'longenough1'
    );
    expect(establishSession).toHaveBeenCalledWith('id-token');
    expect(confirmSignup.mock.invocationCallOrder[0]).toBeLessThan(
      signInWithEmailAndPassword.mock.invocationCallOrder[0]
    );
  });

  test('a rejected code creates nothing — no account, no sign-in', async () => {
    confirmSignup.mockRejectedValue(
      httpError(400, { code: 'CODE_MISMATCH', error: 'That code is not correct. 4 tries left.' })
    );

    await reachCodeStage();
    enterCode('000000');

    // The backend counts the tries, so its sentence is shown as written.
    expect(await screen.findByText('That code is not correct. 4 tries left.')).toBeInTheDocument();
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
    expect(establishSession).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    // Still on the code stage: a fresh code is the only way forward.
    expect(screen.getByRole('button', { name: 'Verify and create account' })).toBeInTheDocument();
  });

  test('lands on the start page chosen in Settings', async () => {
    window.localStorage.setItem('f1-analytics-preferences', JSON.stringify({ startPage: '/replay' }));
    signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1' } });
    render(
      <PreferencesProvider>
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      </PreferencesProvider>
    );

    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByLabelText('Verification code');
    enterCode('123456');

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/replay', { replace: true }));
    window.localStorage.clear();
  });
});
