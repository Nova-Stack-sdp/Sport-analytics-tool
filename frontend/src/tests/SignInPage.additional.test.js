import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SignInPage from '../pages/SignInPage';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';

jest.mock('../firebase', () => ({ auth: {}, googleProvider: { id: 'google' }, githubProvider: { id: 'github' } }));
jest.mock('firebase/auth', () => ({ signInWithEmailAndPassword: jest.fn(), signInWithPopup: jest.fn() }));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ ...jest.requireActual('react-router-dom'), useNavigate: () => mockNavigate }));

function renderPage() {
  return render(<MemoryRouter><SignInPage /></MemoryRouter>);
}

function enterCredentials(email = 'max@example.com', password = 'password123') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
}

describe('SignInPage additional authentication branches', () => {
  beforeEach(() => jest.clearAllMocks());

  test('validates malformed emails before it calls Firebase', async () => {
    renderPage();
    enterCredentials('not-an-email');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  test.each([
    ['auth/wrong-password', 'Incorrect email or password.'],
    ['auth/user-not-found', 'Incorrect email or password.'],
    ['auth/too-many-requests', 'Too many attempts. Try again in a bit.'],
    ['auth/account-exists-with-different-credential', 'An account already exists with this email using a different sign-in method.'],
    ['unexpected', 'Something went wrong signing in. Try again.'],
  ])('maps email login error %s to a safe message', async (code, message) => {
    signInWithEmailAndPassword.mockRejectedValue({ code });
    renderPage();
    enterCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  test('uses a generic message when email login gets a popup-close error', async () => {
    signInWithEmailAndPassword.mockRejectedValue({ code: 'auth/popup-closed-by-user' });
    renderPage();
    enterCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong signing in. Try again.');
  });

  test('shows friendly errors from both social providers', async () => {
    signInWithPopup.mockRejectedValueOnce({ code: 'auth/too-many-requests' });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Continue with Google/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Try again in a bit.');

    signInWithPopup.mockRejectedValueOnce({ code: 'auth/account-exists-with-different-credential' });
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: /Continue with GitHub/i })[1]);
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
    expect(screen.getAllByRole('alert')[1]).toHaveTextContent('different sign-in method');
  });

  test('returns Google popup cancellation to the idle state without an alert', async () => {
    signInWithPopup.mockRejectedValue({ code: 'auth/popup-closed-by-user' });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Continue with Google/i }));
    await waitFor(() => expect(signInWithPopup).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: /Continue with Google/i })).not.toBeDisabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('handles GitHub success and Google popup cancellation without a noisy error', async () => {
    signInWithPopup.mockResolvedValueOnce({ user: { uid: 'u1' } });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Continue with GitHub/i }));
    await waitFor(() => expect(signInWithPopup).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'github' })));
    expect(mockNavigate).toHaveBeenCalledWith('/overview', { replace: true });

    signInWithPopup.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: /Continue with GitHub/i })[1]);
    await waitFor(() => expect(signInWithPopup).toHaveBeenCalledTimes(2));
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });
});
