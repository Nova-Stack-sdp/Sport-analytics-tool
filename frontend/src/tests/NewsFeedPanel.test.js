import { fireEvent, render, screen } from '@testing-library/react';
import NewsFeedPanel from '../components/profile/NewsFeedPanel';
import useF1NewsFeed from '../hooks/useF1NewsFeed';

jest.mock('../hooks/useF1NewsFeed');

const stories = [
  {
    id: 'story-1',
    title: 'McLaren prepares for the next race',
    summary: 'The team shares its plans for the weekend.',
    url: 'https://example.test/story-1',
    imageUrl: 'https://example.test/story-1.jpg',
    publishedAt: new Date().toISOString(),
    category: 'Formula 1',
    source: 'ESPN',
  },
  {
    id: 'story-2',
    title: 'Drivers arrive at the circuit',
    summary: 'The paddock prepares for practice.',
    url: 'https://example.test/story-2',
    imageUrl: null,
    publishedAt: new Date().toISOString(),
    category: 'Formula 1',
    source: 'ESPN',
  },
];

function feedState(overrides = {}) {
  return {
    items: stories,
    loading: false,
    error: '',
    connection: 'live',
    lastUpdated: new Date().toISOString(),
    newItemIds: [],
    refresh: jest.fn(),
    loadMore: jest.fn().mockResolvedValue(true),
    loadingMore: false,
    ...overrides,
  };
}

describe('NewsFeedPanel', () => {
  beforeEach(() => useF1NewsFeed.mockReturnValue(feedState()));
  afterEach(() => jest.clearAllMocks());

  test('shows the live connection and renders publisher links', () => {
    render(<NewsFeedPanel />);

    expect(screen.getByText('Listening for new stories')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: stories[0].title }).closest('a'))
      .toHaveAttribute('href', stories[0].url);
    expect(screen.getByText('2 headlines')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'General' })).not.toBeInTheDocument();
  });

  test('filters For You stories using followed teams', () => {
    render(
      <NewsFeedPanel
        preferences={{
          followedDriverIds: [],
          followedTeamIds: ['mclaren'],
          followedRaceIds: [],
          defaultNewsFilter: 'for-you',
        }}
        catalog={{
          drivers: [],
          teams: [{ id: 'mclaren', name: 'McLaren' }],
          races: [],
        }}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: 'For You' }));

    expect(screen.getByRole('heading', { name: stories[0].title })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: stories[1].title })).not.toBeInTheDocument();
  });

  test('falls back to Latest when followed people have no matching stories', () => {
    render(
      <NewsFeedPanel
        preferences={{
          followedDriverIds: ['driver-max-verstappen'],
          followedTeamIds: [],
        }}
        catalog={{
          drivers: [{ id: 'driver-max-verstappen', name: 'Max Verstappen', teamName: 'Red Bull Racing' }],
          teams: [],
        }}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: 'For You' }));

    expect(screen.getByText(/No recent stories mention/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: stories[0].title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: stories[1].title })).toBeInTheDocument();
  });

  test('checks for fresh stories before showing the next batch', async () => {
    const manyStories = Array.from({ length: 14 }, (_, index) => ({
      ...stories[index % stories.length],
      id: `story-${index + 1}`,
      title: `Formula 1 headline ${index + 1}`,
    }));
    const state = feedState({ items: manyStories });
    useF1NewsFeed.mockReturnValue(state);

    render(<NewsFeedPanel />);

    expect(screen.getByText('Showing 10 of 14')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Formula 1 headline 14' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load more stories' }));

    expect(state.loadMore).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('heading', { name: 'Formula 1 headline 14' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more stories' })).not.toBeInTheDocument();
  });
});
