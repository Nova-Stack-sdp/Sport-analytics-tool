import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SignUpPage from '../pages/SignUpPage';
import { register } from '../api/authClient';

jest.mock('../firebase', () => ({ auth: {} }));

jest.mock('../api/authClient', () => ({
  register: jest.fn(),
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
  test('rejects mismatched passwords without calling the auth API', async () => {
    renderPage();
    fillValidForm();
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'somethingelse' } });

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/don't match/i)).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  test('creates the account and navigates to /overview', async () => {
    register.mockResolvedValue({ user: { uid: 'u1' } });
    renderPage();
    fillValidForm();

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({
        email: 'ada@example.com',
        password: 'longenough1',
        firstName: 'Ada',
        lastName: 'Lovelace',
      })
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/overview', { replace: true }));
  });

  test('shows a friendly message when the email is already in use', async () => {
    register.mockRejectedValue(new Error('An account with that email already exists'));
    renderPage();
    fillValidForm();

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
  });
});