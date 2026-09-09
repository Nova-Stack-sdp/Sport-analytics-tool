import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SignUpPage from '../pages/SignUpPage';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';

jest.mock('../firebase', () => ({ auth: {} }));
jest.mock('firebase/auth', () => ({ createUserWithEmailAndPassword: jest.fn(), updateProfile: jest.fn() }));
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ ...jest.requireActual('react-router-dom'), useNavigate: () => mockNavigate }));

function renderPage() {
  return render(<MemoryRouter><SignUpPage /></MemoryRouter>);
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

describe('SignUpPage additional validation and error states', () => {
  beforeEach(() => jest.clearAllMocks());

  test('shows every client-side validation message', async () => {
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
  });

  test.each([
    ['auth/weak-password', 'Choose a stronger password (at least 6 characters).'],
    ['auth/invalid-email', 'Enter a valid email.'],
    ['unexpected', 'Something went wrong creating your account. Try again.'],
  ])('maps Firebase %s errors to a friendly message', async (code, message) => {
    createUserWithEmailAndPassword.mockRejectedValue({ code });
    renderPage();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  test('keeps the form submitting until profile setup completes', async () => {
    createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1' } });
    let finishProfile;
    updateProfile.mockReturnValue(new Promise((resolve) => { finishProfile = resolve; }));
    renderPage();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('button', { name: 'Creating account…' })).toBeDisabled();
    expect(screen.getByLabelText('First name')).toBeDisabled();
    finishProfile();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/overview', { replace: true }));
    expect(screen.getByRole('link', { name: 'Sign in instead' })).toHaveAttribute('href', '/sign-in');
  });
});
