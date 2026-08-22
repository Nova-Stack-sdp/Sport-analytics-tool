import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SignInPage from '../pages/SignInPage';

describe('SignInPage', () => {
  it('renders the sign-in form and required inputs', () => {
    render(<SignInPage />);

    expect(
      screen.getByRole('heading', { name: /sign in or sign up/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('marks the email and password fields as required', () => {
    render(<SignInPage />);

    expect(screen.getByLabelText(/email/i)).toBeRequired();
    expect(screen.getByLabelText(/password/i)).toBeRequired();
  });

  it('accepts user input in the form fields', () => {
    render(<SignInPage />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'SecurePass123!' } });

    expect(emailInput).toHaveValue('user@example.com');
    expect(passwordInput).toHaveValue('SecurePass123!');
  });

  it('allows form submission when required values are present', () => {
    render(<SignInPage />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'SecurePass123!' },
    });

    fireEvent.submit(screen.getByRole('button', { name: /continue/i }).closest('form'));

    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });
});
