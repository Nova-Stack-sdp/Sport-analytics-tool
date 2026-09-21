import { fireEvent, render, screen } from '@testing-library/react';
import SettingsPage from '../pages/SettingsPage';

const mockSetDeveloperMode = jest.fn();
let mockIsDeveloperMode = false;

jest.mock('../context/DeveloperModeContext', () => ({
  useDeveloperMode: () => ({ isDeveloperMode: mockIsDeveloperMode, setDeveloperMode: mockSetDeveloperMode }),
}));

describe('SettingsPage', () => {
  afterEach(() => {
    mockIsDeveloperMode = false;
    mockSetDeveloperMode.mockClear();
  });

  test('reflects the current developer mode state', () => {
    mockIsDeveloperMode = true;
    render(<SettingsPage />);

    expect(screen.getByRole('checkbox', { name: /toggle developer mode/i })).toBeChecked();
  });

  test('toggling the switch calls setDeveloperMode with the new value', () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole('checkbox', { name: /toggle developer mode/i }));

    expect(mockSetDeveloperMode).toHaveBeenCalledWith(true);
  });
});