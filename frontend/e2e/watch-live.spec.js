import { expect, test } from '@playwright/test';

const SAMPLE_STATE = {
  videoSeconds: 12,
  session: {
    meetingName: 'Spanish Grand Prix',
    sessionName: 'Race',
    currentLap: 4,
    totalLaps: 66,
  },
  weather: { airTemperature: 24, rainfall: 0 },
  recentAnchors: [{ description: 'Hamilton closes the gap into turn one.' }],
  leaderboard: [
    {
      driverNumber: 44,
      position: 1,
      driverName: 'Lewis Hamilton',
      teamName: 'Ferrari',
      lastLapTime: 91.2,
      gapToAhead: 0,
      speedKph: 314,
      tyreCompound: 'MEDIUM',
      gridDelta: 2,
    },
  ],
};

async function stubWatchLive(page, response = { snapshots: [SAMPLE_STATE], bufferStartSeconds: 0, bufferEndSeconds: 30 }) {
  await page.route('**/api/watch-live/state*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(response),
  }));

  await page.route('https://www.youtube.com/iframe_api', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `window.YT = {
      PlayerState: { PLAYING: 1 },
      Player: function(element, options) {
        this.getCurrentTime = function() { return 12.8; };
        this.destroy = function() {};
        setTimeout(function() { options.events.onStateChange({ data: 1 }); }, 0);
      }
    };
    window.onYouTubeIframeAPIReady();`,
  }));
}

test.describe('Watch Live', () => {
  test('loads synchronized telemetry and exposes keyboard-accessible setup controls', async ({ page }) => {
    await stubWatchLive(page);
    await page.goto('/watch-live');

    await expect(page.getByText('Spanish Grand Prix')).toBeVisible();
    await expect(page.getByText('Lewis Hamilton')).toBeVisible();
    await expect(page.getByText('Hamilton closes the gap into turn one.')).toBeVisible();

    await page.getByLabel('Season').fill('2024');
    await page.getByLabel('Grand Prix name contains').fill('Monaco');
    await page.getByRole('button', { name: 'Find race' }).focus();
    await expect(page.getByRole('button', { name: 'Find race' })).toBeFocused();
  });

  test('shows a backend error without horizontal overflow', async ({ page }) => {
    await page.route('**/api/watch-live/state*', (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'not available' }),
    }));
    await page.route('https://www.youtube.com/iframe_api', (route) => route.fulfill({
      contentType: 'application/javascript',
      body: `window.YT = {
        PlayerState: { PLAYING: 1 },
        Player: function(element, options) {
          this.getCurrentTime = function() { return 12.8; };
          this.destroy = function() {};
          setTimeout(function() { options.events.onStateChange({ data: 1 }); }, 0);
        }
      };
      window.onYouTubeIframeAPIReady();`,
    }));
    await page.goto('/watch-live');

    await expect(page.getByText(/Request to \/api\/watch-live\/state failed with status 503/i)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});