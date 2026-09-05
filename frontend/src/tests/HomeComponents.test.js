import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Faq from '../components/Faq';
import FeaturedVideos from '../components/FeaturedVideos';
import HeroBanner from '../components/HeroBanner';
import { getPopularVideos } from '../api/client';

jest.mock('../api/client', () => ({ getPopularVideos: jest.fn() }));

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
  });

  test('expands and collapses FAQ answers independently', () => {
    render(<Faq />);
    const question = screen.getByRole('button', { name: /What is Nova Stack/i });
    expect(question).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(question);
    expect(question).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/live analytics platform/i)).toBeInTheDocument();
    fireEvent.click(question);
    expect(question).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/live analytics platform/i)).not.toBeInTheDocument();
  });

  test('rotates hero images and clears the slide timer on unmount', () => {
    jest.useFakeTimers();
    const { container, unmount } = render(<MemoryRouter><HeroBanner /></MemoryRouter>);
    expect(container.querySelectorAll('.hero-image-slide.is-active')).toHaveLength(1);
    act(() => jest.advanceTimersByTime(3000));
    expect(container.querySelectorAll('.hero-image-slide.is-active')).toHaveLength(1);
    expect(container.querySelectorAll('.hero-image-slide')[1]).toHaveClass('is-active');
    expect(screen.getByRole('link', { name: 'Open live fixture' })).toHaveAttribute('href', '/fixtures');
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
});
