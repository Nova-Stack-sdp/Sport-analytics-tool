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

    expect(screen.getByRole('heading', { name: stories[0].title })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: stories[1].title })).not.toBeInTheDocument();
  });

  test('shows stories in batches with a load more button', () => {
    const manyStories = Array.from({ length: 14 }, (_, index) => ({
      ...stories[index % stories.length],
      id: `story-${index + 1}`,
      title: `Formula 1 headline ${index + 1}`,
    }));
    useF1NewsFeed.mockReturnValue(feedState({ items: manyStories }));

    render(<NewsFeedPanel />);

    expect(screen.getByText('Showing 10 of 14')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Formula 1 headline 14' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load more stories' }));

    expect(screen.getByRole('heading', { name: 'Formula 1 headline 14' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more stories' })).not.toBeInTheDocument();
  });
});
