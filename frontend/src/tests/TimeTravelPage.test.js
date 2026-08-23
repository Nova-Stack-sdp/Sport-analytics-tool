import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TimeTravelPage from '../pages/TimeTravelPage';
import {
  getTimeTravelContext,
  getTimeTravelChangelog,
  getTimeTravelAsOf,
} from '../api/client';

jest.mock('../api/client');

const contextResponse = {
  availableSessions: [{ id: 's1', label: 'Bahrain Grand Prix 2023 · Race' }],
  session: { id: 's1', label: 'Bahrain Grand Prix 2023 · Race' },
  checkpoints: [
    { date: '2026-08-15T12:59:10.000Z', label: 'Sync · accepted', submissionId: 'sub1' },
    { date: '2026-08-19T00:41:19.000Z', label: 'Sync · accepted', submissionId: 'sub2' },
  ],
  entries: [{ entryId: 'e1', driverId: 'd1', name: 'Max VERSTAPPEN' }],
};

const changelogResponse = {
  driverName: 'Max VERSTAPPEN',
  teamName: 'Red Bull Racing',
  history: [
    {
      eventId: 'ev1',
      occurredAt: '2026-08-15T13:00:00.000Z',
      ingestedAt: '2026-08-15T13:01:00.000Z',
      payload: { final_position: 1, points: 25 },
      isOriginal: true,
      wasCorrectedLater: true,
    },
    {
      eventId: 'ev2',
      occurredAt: '2026-08-19T00:41:00.000Z',
      ingestedAt: '2026-08-19T00:41:19.000Z',
      payload: { final_position: 1, points: 26 },
      isOriginal: false,
      wasCorrectedLater: false,
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <TimeTravelPage />
    </MemoryRouter>
  );
}

describe('TimeTravelPage', () => {
  test('loads checkpoints, change log, and a before/after comparison', async () => {
    getTimeTravelContext.mockResolvedValue(contextResponse);
    getTimeTravelChangelog.mockResolvedValue(changelogResponse);
    getTimeTravelAsOf
      .mockResolvedValueOnce({ stats: { points: 25, finalPosition: 1, fastestLapMs: 92608 } })
      .mockResolvedValueOnce({ stats: { points: 26, finalPosition: 1, fastestLapMs: 92608 } });

    renderPage();

    await waitFor(() => expect(screen.getByText('Max VERSTAPPEN · Points scored')).toBeInTheDocument());
    expect(screen.getByText('Original record')).toBeInTheDocument();

    await waitFor(() => expect(getTimeTravelAsOf).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('Fastest lap')).toBeInTheDocument());
    expect(screen.getAllByText('25').length).toBeGreaterThan(0);
    expect(screen.getAllByText('26').length).toBeGreaterThan(0);
  });

  test('shows an honest note that dataset-release comparison is not built', async () => {
    getTimeTravelContext.mockResolvedValue(contextResponse);
    getTimeTravelChangelog.mockResolvedValue(changelogResponse);
    getTimeTravelAsOf.mockResolvedValue({ stats: { points: 25, finalPosition: 1, fastestLapMs: 92608 } });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/not a published dataset release/i)).toBeInTheDocument()
    );
  });
});