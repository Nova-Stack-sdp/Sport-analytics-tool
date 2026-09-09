import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';

jest.mock('../firebase', () => ({ auth: {} }));
jest.mock('firebase/auth', () => ({ sendPasswordResetEmail: jest.fn() }));

function renderPage() {
  return render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => jest.clearAllMocks());

  test('does not submit an empty email and links back to sign in', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/sign-in');
  });

  test('sends a trimmed email and confirms without leaking account existence', async () => {
    sendPasswordResetEmail.mockResolvedValue();
    renderPage();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: '  max@example.com  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    await waitFor(() => expect(sendPasswordResetEmail).toHaveBeenCalledWith(expect.anything(), 'max@example.com'));
    expect(await screen.findByRole('status')).toHaveTextContent('max@example.com');
  });

  test.each([
    ['auth/invalid-email', 'Enter a valid email.'],
    ['auth/too-many-requests', 'Too many attempts. Try again in a bit.'],
  ])('shows a friendly error for %s', async (code, message) => {
    sendPasswordResetEmail.mockRejectedValue({ code });
    renderPage();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'max@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  test('uses the generic sent state for unrecognised reset errors', async () => {
    sendPasswordResetEmail.mockRejectedValue({ code: 'auth/user-not-found' });
    renderPage();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'unknown@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('status')).toHaveTextContent('unknown@example.com');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
