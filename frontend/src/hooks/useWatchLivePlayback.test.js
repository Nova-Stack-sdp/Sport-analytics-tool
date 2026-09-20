import { act, renderHook, waitFor } from '@testing-library/react';
import { getWatchLiveState } from '../api/client';
import { useWatchLivePlayback } from './useWatchLivePlayback';

jest.mock('../api/client', () => ({
  getWatchLiveState: jest.fn(),
}));

describe('useWatchLivePlayback', () => {
  let playerOptions;
  let player;

  beforeEach(() => {
    playerOptions = null;
    player = {
      getCurrentTime: jest.fn(() => 12.8),
      destroy: jest.fn(),
    };
    window.YT = {
      PlayerState: { PLAYING: 1 },
      Player: jest.fn((element, options) => {
        playerOptions = options;
        return player;
      }),
    };
    getWatchLiveState.mockReset();
  });

  afterEach(() => {
    delete window.YT;
    jest.useRealTimers();
  });

  test('fetches a playback buffer and promotes the matching snapshot while playing', async () => {
    const snapshot = {
      videoSeconds: 12,
      session: { currentLap: 4, totalLaps: 66 },
      leaderboard: [],
    };
    getWatchLiveState.mockResolvedValue({
      bufferStartSeconds: 0,
      bufferEndSeconds: 30,
      snapshots: [snapshot],
    });

    const { result, unmount } = renderHook(() => useWatchLivePlayback());
    result.current.iframeRef.current = document.createElement('iframe');

    await waitFor(() => expect(window.YT.Player).toHaveBeenCalled());
    jest.useFakeTimers();
    await act(async () => {
      playerOptions.events.onStateChange({ data: window.YT.PlayerState.PLAYING });
    });

    expect(getWatchLiveState).toHaveBeenCalledWith({ videoSeconds: 12, bufferSeconds: 15 });
    expect(result.current.loading).toBe(false);

    act(() => jest.advanceTimersByTime(500));
    await waitFor(() => expect(result.current.state).toEqual(snapshot));
    expect(result.current.snapshots).toEqual([snapshot]);

    unmount();
    expect(player.destroy).toHaveBeenCalled();
  });

  test('exposes backend failures without crashing the playback surface', async () => {
    getWatchLiveState.mockRejectedValue(new Error('telemetry unavailable'));
    const { result } = renderHook(() => useWatchLivePlayback());
    result.current.iframeRef.current = document.createElement('iframe');

    await waitFor(() => expect(window.YT.Player).toHaveBeenCalled());
    await act(async () => {
      playerOptions.events.onStateChange({ data: window.YT.PlayerState.PLAYING });
    });

    await waitFor(() => expect(result.current.error).toBe('telemetry unavailable'));
    expect(result.current.state).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});