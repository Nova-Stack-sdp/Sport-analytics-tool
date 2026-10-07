import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SignUpPage from '../pages/SignUpPage';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';

// On success the page exchanges the new account's ID token
// (credential.user.getIdToken()) for a backend session cookie via
// establishSession before navigating, so both need stand-ins here.
jest.mock('../firebase', () => ({ auth: {} }));
jest.mock('../api/client', () => ({ establishSession: jest.fn().mockResolvedValue({}) }));

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(),
  updateProfile: jest.fn(),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SignUpPage', () => {
  test('rejects mismatched passwords without calling Firebase', async () => {
    renderPage();
    fillValidForm();
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'somethingelse' } });

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/don't match/i)).toBeInTheDocument();
    expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  test('creates the account, sets the display name, and sends the new account to /verify-email', async () => {
    createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1', getIdToken: jest.fn().mockResolvedValue('test-id-token') } });
    updateProfile.mockResolvedValue();
    renderPage();
    fillValidForm();

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'ada@example.com',
        'longenough1'
      )
    );
    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'u1' }),
      { displayName: 'Ada Lovelace' }
    );
    // A brand-new email/password account has never proved its address, so the
    // code page is where it goes — not the start page (see RequireAuth).
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/verify-email', { replace: true }));
  });

  test('shows a friendly message when the email is already in use', async () => {
    createUserWithEmailAndPassword.mockRejectedValue({ code: 'auth/email-already-in-use' });
    renderPage();
    fillValidForm();

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
  });
});