import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SettingsPanel from '../components/profile/SettingsPanel';
import { PreferencesProvider } from '../context/PreferencesContext';
import { PREFERENCES_STORAGE_KEY } from '../services/preferences';

function savedPreferences() {
  return JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY) || '{}');
}

function renderWithPreferences() {
  return render(
    <PreferencesProvider>
      <SettingsPanel />
    </PreferencesProvider>
  );
}

const mockSetDeveloperMode = jest.fn();
let mockIsDeveloperMode = false;

jest.mock('../context/DeveloperModeContext', () => ({
  useDeveloperMode: () => ({ isDeveloperMode: mockIsDeveloperMode, setDeveloperMode: mockSetDeveloperMode }),
}));

describe('SettingsPanel — developer mode', () => {
  afterEach(() => {
    mockIsDeveloperMode = false;
    mockSetDeveloperMode.mockReset();
  });

  test('reflects the current developer mode state', () => {
    mockIsDeveloperMode = true;
    render(<SettingsPanel />);

    expect(screen.getByRole('checkbox', { name: /toggle developer mode/i })).toBeChecked();
  });

  test('toggling the switch calls setDeveloperMode with the new value', async () => {
    mockSetDeveloperMode.mockResolvedValue();
    render(<SettingsPanel />);

    fireEvent.click(screen.getByRole('checkbox', { name: /toggle developer mode/i }));

    await waitFor(() => expect(mockSetDeveloperMode).toHaveBeenCalledWith(true));
  });

  test('disables the switch while the change is saving', async () => {
    let resolveSave;
    mockSetDeveloperMode.mockReturnValue(new Promise((resolve) => { resolveSave = resolve; }));
    render(<SettingsPanel />);

    fireEvent.click(screen.getByRole('checkbox', { name: /toggle developer mode/i }));

    expect(screen.getByRole('checkbox', { name: /toggle developer mode/i })).toBeDisabled();

    resolveSave();
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /toggle developer mode/i })).not.toBeDisabled()
    );
  });

  test('shows an error message when saving fails, without crashing', async () => {
    mockSetDeveloperMode.mockRejectedValue(new Error('network down'));
    render(<SettingsPanel />);

    fireEvent.click(screen.getByRole('checkbox', { name: /toggle developer mode/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not update developer mode/i);
  });
});

describe('SettingsPanel — site preferences', () => {
  beforeEach(() => window.localStorage.clear());

  test('shows every settings group', () => {
    renderWithPreferences();

    ['Appearance', 'Motion', 'Race Replay', 'Time & start page', 'Developer mode'].forEach((title) =>
      expect(screen.getByText(title, { selector: '.card-title' })).toBeInTheDocument()
    );
  });

  test('picking a theme and density saves them and confirms', () => {
    renderWithPreferences();

    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Theme' })).getByLabelText('Light'));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Density' })).getByLabelText('Compact'));

    expect(savedPreferences()).toEqual(expect.objectContaining({ theme: 'light', density: 'compact' }));
    expect(within(screen.getByRole('radiogroup', { name: 'Theme' })).getByLabelText('Light')).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('Saved in this browser.');
  });

  test('reduce motion and the replay defaults are saved', () => {
    renderWithPreferences();

    fireEvent.click(screen.getByRole('checkbox', { name: /toggle reduce motion/i }));
    fireEvent.change(screen.getByLabelText('Default speed'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /toggle show safety car by default/i }));

    expect(savedPreferences()).toEqual(expect.objectContaining({
      reduceMotion: true,
      replaySpeed: 4,
      replayShowSafetyCar: false,
    }));
  });

  test('clock and time zone choices update the example time', () => {
    renderWithPreferences();

    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Clock' })).getByLabelText('24-hour'));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Show times in' })).getByLabelText('UTC'));

    expect(screen.getByText(/14:05.*UTC/)).toBeInTheDocument();
    expect(savedPreferences()).toEqual(expect.objectContaining({ clock: '24h', timeZone: 'utc' }));
  });

  test('the start page choice is saved', () => {
    renderWithPreferences();

    fireEvent.change(screen.getByLabelText('Start page'), { target: { value: '/replay' } });

    expect(savedPreferences().startPage).toBe('/replay');
  });

  test('reset puts every site preference back to its default', () => {
    renderWithPreferences();
    fireEvent.change(screen.getByLabelText('Start page'), { target: { value: '/replay' } });

    fireEvent.click(screen.getByRole('button', { name: 'Reset site preferences' }));

    expect(screen.getByLabelText('Start page')).toHaveValue('/overview');
    expect(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(/reset to their defaults/i);
  });
});
