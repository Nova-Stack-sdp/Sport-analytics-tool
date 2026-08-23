import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SignUpPage from '../pages/SignUpPage';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';

jest.mock('../firebase', () => ({ auth: {} }));

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

  test('creates the account, sets the display name, and navigates to /overview', async () => {
    createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1' } });
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
      { uid: 'u1' },
      { displayName: 'Ada Lovelace' }
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/overview', { replace: true }));
  });

  test('shows a friendly message when the email is already in use', async () => {
    createUserWithEmailAndPassword.mockRejectedValue({ code: 'auth/email-already-in-use' });
    renderPage();
    fillValidForm();

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
  });
});