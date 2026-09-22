import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SettingsPage from '../pages/SettingsPage';

const mockSetDeveloperMode = jest.fn();
let mockIsDeveloperMode = false;

jest.mock('../context/DeveloperModeContext', () => ({
  useDeveloperMode: () => ({ isDeveloperMode: mockIsDeveloperMode, setDeveloperMode: mockSetDeveloperMode }),
}));

describe('SettingsPage', () => {
  afterEach(() => {
    mockIsDeveloperMode = false;
    mockSetDeveloperMode.mockReset();
  });

  test('reflects the current developer mode state', () => {
    mockIsDeveloperMode = true;
    render(<SettingsPage />);

    expect(screen.getByRole('checkbox', { name: /toggle developer mode/i })).toBeChecked();
  });

  test('toggling the switch calls setDeveloperMode with the new value', async () => {
    mockSetDeveloperMode.mockResolvedValue();
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole('checkbox', { name: /toggle developer mode/i }));

    await waitFor(() => expect(mockSetDeveloperMode).toHaveBeenCalledWith(true));
  });

  test('disables the switch while the change is saving', async () => {
    let resolveSave;
    mockSetDeveloperMode.mockReturnValue(new Promise((resolve) => { resolveSave = resolve; }));
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole('checkbox', { name: /toggle developer mode/i }));

    expect(screen.getByRole('checkbox', { name: /toggle developer mode/i })).toBeDisabled();

    resolveSave();
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /toggle developer mode/i })).not.toBeDisabled()
    );
  });

  test('shows an error message when saving fails, without crashing', async () => {
    mockSetDeveloperMode.mockRejectedValue(new Error('network down'));
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole('checkbox', { name: /toggle developer mode/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not update developer mode/i);
  });
});