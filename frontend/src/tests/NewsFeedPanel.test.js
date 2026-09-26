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
    source: 'BBC Sport',
  },
  {
    id: 'story-2',
    title: 'Drivers arrive at the circuit',
    summary: 'The paddock prepares for practice.',
    url: 'https://example.test/story-2',
    imageUrl: null,
    publishedAt: new Date().toISOString(),
    category: 'Formula 1',
    source: 'BBC Sport',
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
  });

  test('marks newly received stories and supports manual refresh', () => {
    const refresh = jest.fn();
    useF1NewsFeed.mockReturnValue(feedState({ newItemIds: ['story-2'], refresh }));
    render(<NewsFeedPanel />);

    expect(screen.getByText('New')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('shows cached stories alongside a stale-feed warning', () => {
    useF1NewsFeed.mockReturnValue(feedState({
      error: 'News provider returned 503',
      connection: 'reconnecting',
    }));
    render(<NewsFeedPanel />);

    expect(screen.getByRole('alert')).toHaveTextContent('Showing the most recent cached stories.');
    expect(screen.getByRole('heading', { name: stories[0].title })).toBeInTheDocument();
  });

  test('shows a loading state before the first feed arrives', () => {
    useF1NewsFeed.mockReturnValue(feedState({ items: [], loading: true, lastUpdated: null }));
    render(<NewsFeedPanel />);

    expect(screen.getByLabelText('Loading Formula 1 news')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled();
  });
});
