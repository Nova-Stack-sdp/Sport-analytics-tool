import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SignInPage from '../pages/SignInPage';
import { signInWithPopup } from 'firebase/auth';
import { login } from '../api/authClient';

jest.mock('../firebase', () => ({
  auth: {},
  googleProvider: {},
  githubProvider: {},
}));

jest.mock('firebase/auth', () => ({
  signInWithPopup: jest.fn(),
}));

jest.mock('../api/authClient', () => ({
  login: jest.fn(),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <SignInPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SignInPage', () => {
  test('renders the sign-in form', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  test('shows validation errors instead of submitting when fields are empty', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText(/enter your email/i)).toBeInTheDocument();
    expect(screen.getByText(/enter your password/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  test('signs in with email/password and navigates to /overview on success', async () => {
    login.mockResolvedValue({ user: { uid: 'u1' } });
    renderPage();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'driver@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({
        email: 'driver@example.com',
        password: 'password123',
      })
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/overview', { replace: true }));
  });

  test('shows a friendly message on invalid credentials, not the raw Firebase error', async () => {
    login.mockRejectedValue(new Error('Incorrect email or password'));
    renderPage();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'driver@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText(/incorrect email or password/i)).toBeInTheDocument();
  });

  test('Google sign-in calls signInWithPopup and navigates to /overview on success', async () => {
    signInWithPopup.mockResolvedValue({ user: { uid: 'u1' } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    await waitFor(() => expect(signInWithPopup).toHaveBeenCalled());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/overview', { replace: true }));
  });

  test('the forgot-password link points to a real route', () => {
    renderPage();
    expect(screen.getByText(/forgot password/i).closest('a')).toHaveAttribute(
      'href',
      '/forgot-password'
    );
  });
});