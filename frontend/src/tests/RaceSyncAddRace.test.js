import { act, fireEvent, render, screen, within } from '@testing-library/react';
import RaceSyncAddRace from '../components/race-sync/RaceSyncAddRace';
import {
  RaceSyncSelectionProvider,
  useRaceSyncSelection,
} from '../components/race-sync/RaceSyncSelection';
import {
  getAvailableRaces,
  getFixtures,
  getRaceSyncStatus,
  requestRaceSync,
} from '../api/client';

jest.mock('../api/client', () => ({
  getFixtures: jest.fn(),
  getAvailableRaces: jest.fn(),
  requestRaceSync: jest.fn(),
  getRaceSyncStatus: jest.fn(),
}));

const SEASON = {
  year: 2024,
  races: [
    { sessionKey: 9472, name: 'Bahrain Grand Prix', location: 'Sakhir', status: 'ready', sessionId: 's-bahrain', dateStart: '2024-03-02T15:00:00+00:00' },
    { sessionKey: 9480, name: 'Saudi Arabia Grand Prix', location: 'Jeddah', status: 'synced', sessionId: 's-saudi', dateStart: '2024-03-09T17:00:00+00:00' },
    { sessionKey: 9523, name: 'Monaco Grand Prix', location: 'Monaco', status: 'missing', sessionId: null, dateStart: '2024-05-26T13:00:00+00:00' },
    { sessionKey: 9999, name: 'Abu Dhabi Grand Prix', location: 'Yas Marina', status: 'upcoming', sessionId: null, dateStart: '2024-12-08T13:00:00+00:00' },
  ],
};

// Reads back what the add-race view did to the shared selection.
function Picked() {
  const { selectedId, fixtures } = useRaceSyncSelection();
  return (
    <p>
      picked:{selectedId ?? 'none'} · races:{fixtures.length}
    </p>
  );
}

function renderAddRace(props = {}) {
  const onDone = jest.fn();
  render(
    <RaceSyncSelectionProvider>
      <RaceSyncAddRace query="" onBack={jest.fn()} onDone={onDone} {...props} />
      <Picked />
    </RaceSyncSelectionProvider>
  );
  return { onDone };
}

beforeEach(() => {
  jest.clearAllMocks();
  getFixtures.mockResolvedValue({ fixtures: [] });
  getAvailableRaces.mockResolvedValue(SEASON);
});

afterEach(() => {
  jest.useRealTimers();
});

test("lists the season's races with where each stands, and one action that applies", async () => {
  renderAddRace({ query: '2024' });
  const list = await screen.findByRole('list', { name: '2024 races' });
  expect(getAvailableRaces).toHaveBeenCalledWith(2024);
  const row = (name) =>
    within(list)
      .getAllByRole('listitem')
      .find((item) => within(item).queryByText(name));
  expect(within(row('Bahrain Grand Prix')).getByRole('button', { name: 'Open' })).toBeInTheDocument();
  expect(within(row('Saudi Arabia Grand Prix')).getByText('No replay data')).toBeInTheDocument();
  expect(within(row('Saudi Arabia Grand Prix')).queryByRole('button')).not.toBeInTheDocument();
  expect(
    within(row('Monaco Grand Prix')).getByRole('button', { name: 'Add Monaco Grand Prix' })
  ).toBeInTheDocument();
  expect(within(row('Abu Dhabi Grand Prix')).getByText('Not run yet')).toBeInTheDocument();
});

test('what was typed in the search narrows the list to the race being looked for', async () => {
  renderAddRace({ query: 'monaco 2024' });
  const list = await screen.findByRole('list', { name: '2024 races' });
  expect(within(list).getByText('Monaco Grand Prix')).toBeInTheDocument();
  expect(within(list).queryByText('Bahrain Grand Prix')).not.toBeInTheDocument();
});

test('adding a race syncs it, polls it, and opens it the moment it is ready', async () => {
  jest.useFakeTimers();
  requestRaceSync.mockResolvedValue({ sessionKey: 9523, status: 'queued' });
  getRaceSyncStatus
    .mockResolvedValueOnce({ sessionKey: 9523, status: 'syncing' })
    .mockResolvedValueOnce({ sessionKey: 9523, status: 'ready', sessionId: 's-monaco' });
  const { onDone } = renderAddRace({ query: 'monaco 2024' });

  fireEvent.click(await screen.findByRole('button', { name: 'Add Monaco Grand Prix' }));
  expect(requestRaceSync).toHaveBeenCalledWith(9523);
  expect(await screen.findByText('Queued')).toBeInTheDocument();

  await act(async () => {
    jest.advanceTimersByTime(4000);
  });
  expect(await screen.findByText('Adding…')).toBeInTheDocument();

  // The race lands: the list of races is re-read so the new one is in the
  // search, and it is loaded into the stage.
  getFixtures.mockResolvedValue({
    fixtures: [{ id: 's-monaco', meetingName: 'Monaco Grand Prix', replayReady: true }],
  });
  await act(async () => {
    jest.advanceTimersByTime(4000);
  });
  expect(await screen.findByText('picked:s-monaco · races:1')).toBeInTheDocument();
  expect(onDone).toHaveBeenCalled();
});

test('a reader who is not signed in is told to sign in', async () => {
  requestRaceSync.mockRejectedValue(Object.assign(new Error('401'), { status: 401 }));
  renderAddRace({ query: 'monaco 2024' });
  fireEvent.click(await screen.findByRole('button', { name: 'Add Monaco Grand Prix' }));
  expect(await screen.findByText('Sign in to add a race.')).toBeInTheDocument();
});

test('a race that is already here simply opens', async () => {
  const { onDone } = renderAddRace({ query: '2024' });
  fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
  expect(await screen.findByText(/picked:s-bahrain/)).toBeInTheDocument();
  expect(onDone).toHaveBeenCalled();
});
