import { act, renderHook, waitFor } from '@testing-library/react';
import useF1NewsFeed from './useF1NewsFeed';
import { getF1News, getF1NewsStreamUrl } from '../api/client';

jest.mock('../api/client', () => ({
  getF1News: jest.fn(),
  getF1NewsStreamUrl: jest.fn(() => 'http://localhost/api/news/stream'),
}));

class MockEventSource {
  static latest = null;

  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.listeners = {};
    this.close = jest.fn();
    MockEventSource.latest = this;
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  emit(type, payload) {
    this.listeners[type]?.({ data: JSON.stringify(payload) });
  }
}

const originalEventSource = global.EventSource;

describe('useF1NewsFeed', () => {
  beforeEach(() => {
    global.EventSource = MockEventSource;
    MockEventSource.latest = null;
    getF1News.mockResolvedValue({
      items: [{ id: 'old', title: 'Existing story', publishedAt: '2026-09-24T09:00:00Z' }],
      lastUpdated: '2026-09-24T09:00:00Z',
      stale: false,
    });
  });

  afterEach(() => jest.clearAllMocks());
  afterAll(() => { global.EventSource = originalEventSource; });

  test('adds a new story received from the live event stream', async () => {
    const { result, unmount } = renderHook(() => useF1NewsFeed());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getF1NewsStreamUrl).toHaveBeenCalledTimes(1);
    expect(MockEventSource.latest.options).toEqual({ withCredentials: true });

    act(() => {
      MockEventSource.latest.onopen();
      MockEventSource.latest.emit('news', {
        items: [
          { id: 'new', title: 'Breaking story', publishedAt: '2026-09-24T10:00:00Z' },
          { id: 'old', title: 'Existing story', publishedAt: '2026-09-24T09:00:00Z' },
        ],
        newItems: [{ id: 'new', title: 'Breaking story' }],
        lastUpdated: '2026-09-24T10:00:00Z',
        stale: false,
      });
    });

    expect(result.current.connection).toBe('live');
    expect(result.current.items[0].title).toBe('Breaking story');
    expect(result.current.newItemIds).toEqual(['new']);

    const stream = MockEventSource.latest;
    unmount();
    expect(stream.close).toHaveBeenCalledTimes(1);
  });
});
