import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TimeTravelPage from '../pages/TimeTravelPage';
import { getTimeTravelAsOf, getTimeTravelChangelog, getTimeTravelContext } from '../api/client';

jest.mock('../api/client', () => ({
  getTimeTravelContext: jest.fn(),
  getTimeTravelChangelog: jest.fn(),
  getTimeTravelAsOf: jest.fn(),
}));

const context = {
  availableSessions: [{ id: 's1', label: 'Bahrain Race' }, { id: 's2', label: 'Monaco Race' }],
  session: { id: 's1' },
  checkpoints: [
    { submissionId: 'one', date: '2026-01-01T10:00:00Z', label: 'Initial sync' },
    { submissionId: 'two', date: '2026-01-02T10:00:00Z', label: 'Correction' },
  ],
  entries: [{ entryId: 'e1', name: 'Max' }, { entryId: 'e2', name: 'Lando' }],
};

const history = {
  driverName: 'Max',
  history: [
    { eventId: 'one', ingestedAt: '2026-01-01T10:00:00Z', payload: { points: 25, final_position: 1 }, isOriginal: true, wasCorrectedLater: true },
    { eventId: 'two', ingestedAt: null, payload: { points: null, final_position: null }, isOriginal: false, wasCorrectedLater: false },
  ],
};

function renderPage() {
  return render(<TimeTravelPage />);
}

describe('TimeTravelPage additional states', () => {
  beforeEach(() => jest.clearAllMocks());

  test('supports checkpoint, fixture, and entry selection with same and changed comparisons', async () => {
    getTimeTravelContext.mockResolvedValue(context);
    getTimeTravelChangelog.mockResolvedValue(history);
    getTimeTravelAsOf
      .mockResolvedValueOnce({ stats: { points: 25, finalPosition: 1, fastestLapMs: 60000 } })
      .mockResolvedValueOnce({ stats: { points: 26, finalPosition: 2, fastestLapMs: null } })
      .mockResolvedValue({ stats: { points: 25, finalPosition: 1, fastestLapMs: 60000 } });
    renderPage();

    await screen.findByText('Max · Points scored');
    await screen.findByText('Original record');
    await waitFor(() => expect(screen.getByText('Compare two points in time')).toBeInTheDocument());
    expect(screen.getAllByText('Correction').length).toBeGreaterThan(1);
    expect(screen.getByText('1:00.000')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(1);

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 's2' } });
    await waitFor(() => expect(getTimeTravelContext).toHaveBeenLastCalledWith('s2'));
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'e2' } });
    await waitFor(() => expect(getTimeTravelChangelog).toHaveBeenLastCalledWith('e2'));
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: '1' } });
    fireEvent.change(screen.getAllByRole('combobox')[3], { target: { value: '0' } });
    await waitFor(() => expect(getTimeTravelAsOf).toHaveBeenCalled());
    fireEvent.click(document.querySelectorAll('.tl-point')[1]);
    expect(screen.getByText(/Selected state:/i)).toBeInTheDocument();
  });

  test('renders no-history empty states when no context data exists', async () => {
    getTimeTravelContext.mockResolvedValue({ availableSessions: [], session: null, checkpoints: [], entries: [] });
    renderPage();
    expect(await screen.findByText('This fixture has no submission history yet.')).toBeInTheDocument();
    expect(screen.getByText('Change log').parentElement).toBeInTheDocument();
  });

  test('shows changelog and comparison failures', async () => {
    getTimeTravelContext.mockResolvedValue(context);
    getTimeTravelChangelog.mockRejectedValue(new Error('history unavailable'));
    getTimeTravelAsOf.mockRejectedValue(new Error('comparison unavailable'));
    renderPage();
    expect(await screen.findByText(/history unavailable/i)).toBeInTheDocument();
    expect(await screen.findByText(/comparison unavailable/i)).toBeInTheDocument();
  });

  test('shows empty classification history', async () => {
    getTimeTravelContext.mockResolvedValue(context);
    getTimeTravelChangelog.mockResolvedValue({ driverName: 'Max', history: [] });
    getTimeTravelAsOf.mockResolvedValue({ stats: { points: 1, finalPosition: 1, fastestLapMs: 1 } });
    renderPage();
    expect(await screen.findByText('No classification history for this driver yet.')).toBeInTheDocument();
  });

  test('shows context errors and ignores a late context response after unmount', async () => {
    getTimeTravelContext.mockRejectedValue(new Error('context unavailable'));
    renderPage();
    expect(await screen.findByText(/context unavailable/i)).toBeInTheDocument();

    let resolve;
    getTimeTravelContext.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const pending = renderPage();
    pending.unmount();
    await act(async () => resolve(context));
  });
});
