import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Faq from '../components/Faq';
import FeaturedVideos from '../components/FeaturedVideos';
import HeroBanner from '../components/HeroBanner';
import { getOverview, getPopularVideos } from '../api/client';

jest.mock('../api/client', () => ({ getPopularVideos: jest.fn(), getOverview: jest.fn() }));

const videos = [
  {
    id: 'video-1',
    videoId: 'abc123',
    rank: 1,
    title: 'Race highlights',
    sub: 'Formula 1',
    thumbnailUrl: 'https://example.test/thumb.jpg',
    youtubeUrl: 'https://youtube.test/watch?v=abc123',
  },
  {
    id: 'video-2',
    videoId: 'def456',
    rank: 2,
    title: 'Weekend recap',
    sub: 'Formula 1',
    thumbnailUrl: null,
    youtubeUrl: 'https://youtube.test/watch?v=def456',
  },
];

function renderVideos() {
  return render(<MemoryRouter><FeaturedVideos /></MemoryRouter>);
}

describe('home-page components', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getOverview.mockReturnValue(new Promise(() => {}));
  });

  test('expands and collapses FAQ answers independently', () => {
    render(<Faq />);
    const question = screen.getByRole('button', { name: /What is F1Lytics/i });
    expect(question).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(question);
    expect(question).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/A Formula 1 analytics site/i)).toBeInTheDocument();
    fireEvent.click(question);
    expect(question).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/A Formula 1 analytics site/i)).not.toBeInTheDocument();
  });

  test('rotates hero images and clears the slide timer on unmount', () => {
    jest.useFakeTimers();
    const { container, unmount } = render(<MemoryRouter><HeroBanner /></MemoryRouter>);
    expect(container.querySelectorAll('.hero-image-slide.is-active')).toHaveLength(1);
    act(() => jest.advanceTimersByTime(3000));
    expect(container.querySelectorAll('.hero-image-slide.is-active')).toHaveLength(1);
    expect(container.querySelectorAll('.hero-image-slide')[1]).toHaveClass('is-active');
    expect(screen.getByRole('link', { name: 'Browse fixtures' })).toHaveAttribute('href', '/fixtures');
    expect(screen.queryByText(/Live · Round/)).not.toBeInTheDocument();
    unmount();
    jest.useRealTimers();
  });

  test('renders video loading and unavailable states', async () => {
    getPopularVideos.mockReturnValueOnce(new Promise(() => {}));
    const loading = renderVideos();
    expect(loading.container.querySelectorAll('.video-card.skeleton')).toHaveLength(4);
    loading.unmount();

    getPopularVideos.mockRejectedValueOnce(new Error('backend down'));
    renderVideos();
    expect(await screen.findByText(/Featured videos are temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /FORMULA 1 YouTube channel/i })).toHaveAttribute('target', '_blank');

    getPopularVideos.mockResolvedValueOnce({});
    renderVideos();
    await waitFor(() => expect(getPopularVideos.mock.calls.length).toBeGreaterThanOrEqual(3));
  });

  test('renders video cards, loads the IFrame API once, and destroys a player on cleanup', async () => {
    delete window.YT;
    delete window.onYouTubeIframeAPIReady;
    const destroy = jest.fn();
    const previousReady = jest.fn();
    window.onYouTubeIframeAPIReady = previousReady;
    getPopularVideos.mockResolvedValue({ videos });
    const { container, unmount } = renderVideos();

    await screen.findByText('Race highlights');
    expect(document.querySelector('.video-thumb img')).toHaveAttribute('src', videos[0].thumbnailUrl);
    expect(screen.getByRole('link', { name: 'Weekend recap' })).toHaveAttribute('href', videos[1].youtubeUrl);
    fireEvent.click(screen.getByRole('button', { name: 'Play Race highlights' }));
    expect(document.querySelector('script[src="https://www.youtube.com/iframe_api"]')).toBeInTheDocument();

    window.YT = { Player: jest.fn(() => ({ destroy })) };
    await act(async () => window.onYouTubeIframeAPIReady());
    await waitFor(() => expect(window.YT.Player).toHaveBeenCalledWith(expect.any(HTMLDivElement), expect.objectContaining({ videoId: 'abc123' })));
    expect(previousReady).toHaveBeenCalled();
    expect(container.querySelector('.video-player')).toHaveAttribute('title', 'Race highlights');
    unmount();
    expect(destroy).toHaveBeenCalled();
  });

  test('keeps the fallback link usable if player construction fails', async () => {
    window.YT.Player.mockImplementation(() => { throw new Error('player unavailable'); });
    getPopularVideos.mockResolvedValue({ videos: [videos[0]] });
    renderVideos();
    await screen.findByText('Race highlights');
    fireEvent.click(screen.getByRole('button', { name: 'Play Race highlights' }));
    await waitFor(() => expect(window.YT.Player).toHaveBeenCalled());
    expect(screen.getByText('Race highlights')).toBeInTheDocument();
  });

  test('treats an empty successful video payload as unavailable and ignores late work after unmount', async () => {
    getPopularVideos.mockResolvedValueOnce({ videos: [] });
    renderVideos();
    expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();

    let resolve;
    getPopularVideos.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const pending = renderVideos();
    pending.unmount();
    await act(async () => resolve({ videos }));
    expect(getPopularVideos).toHaveBeenCalledTimes(2);
  });

  test('says when the videos are the saved selection rather than the latest uploads', async () => {
    getPopularVideos.mockResolvedValueOnce({ source: 'fallback', videos });
    renderVideos();
    expect(await screen.findByText(/saved selection of race highlights/i)).toBeInTheDocument();
    expect(screen.queryByText(/trending/i)).not.toBeInTheDocument();
  });

  test('describes YouTube results as the latest uploads, newest first', async () => {
    getPopularVideos.mockResolvedValueOnce({ source: 'youtube', videos });
    renderVideos();
    expect(await screen.findByText(/newest uploads on the official FORMULA 1 YouTube channel/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Latest from Formula 1' })).toBeInTheDocument();
  });

  test('hero names the real latest session and links straight to it', async () => {
    getOverview.mockResolvedValueOnce({
      season: 2025,
      latestSession: { id: 'sess-1', meetingName: 'Abu Dhabi Grand Prix', type: 'Race' },
    });
    render(<MemoryRouter><HeroBanner /></MemoryRouter>);
    expect(await screen.findByText('2025 season · Latest: Abu Dhabi Grand Prix Race')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the latest fixture' })).toHaveAttribute('href', '/fixtures?session=sess-1');
    expect(screen.getByRole('heading', { name: 'F1Lytics' })).toBeInTheDocument();
  });

  test('hero falls back to a plain eyebrow and the fixtures list if the overview fails', async () => {
    getOverview.mockRejectedValueOnce(new Error('down'));
    render(<MemoryRouter><HeroBanner /></MemoryRouter>);
    await waitFor(() => expect(getOverview).toHaveBeenCalled());
    expect(screen.getByText('Formula 1 analytics')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse fixtures' })).toHaveAttribute('href', '/fixtures');
  });

  test('FAQ answers make no live or real-time claims and describe the real access rules', () => {
    render(<Faq />);
    screen.getAllByRole('button').forEach((q) => fireEvent.click(q));
    expect(screen.queryByText(/real time|live analytics/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing on the site is a live feed/)).toBeInTheDocument();
    expect(screen.getByText(/turn on developer mode in Profile → Settings/)).toBeInTheDocument();
  });
});
