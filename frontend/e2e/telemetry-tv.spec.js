import { expect, test } from '@playwright/test';

const RACES = [
  {
    slug: 'toronto-2025',
    eventName: 'Ontario Honda Dealers Indy Toronto',
    sessionDate: '7/20/2025',
    totalLaps: 90,
    fieldSize: 27,
    video: { youtubeId: 'UO4c-wMLhso', embedStartSeconds: 184, videoDurationSeconds: 7759 },
  },
  {
    slug: 'long-beach-2023',
    eventName: 'Acura Grand Prix of Long Beach',
    sessionDate: '4/16/2023',
    totalLaps: 85,
    fieldSize: 27,
    video: { youtubeId: '2ifguXu0P7s', embedStartSeconds: 1704, videoDurationSeconds: 8163 },
  },
];

test.describe('TelemetryTV', () => {
  test('embeds the selected INDYCAR race video from the race dropdown', async ({ page }) => {
    await page.route('**/api/telemetry-tv/races', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ races: RACES }),
      })
    );

    await page.goto('/telemetry-tv');

    const raceSelect = page.getByLabel('Race');
    await expect(raceSelect).toHaveValue('toronto-2025');
    await expect(page.locator('.video-embed iframe')).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/UO4c-wMLhso?enablejsapi=1&playsinline=1&start=184'
    );

    await raceSelect.selectOption('long-beach-2023');

    await expect(page.locator('.video-embed iframe')).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/2ifguXu0P7s?enablejsapi=1&playsinline=1&start=1704'
    );
    await expect(page.locator('.video-panel .card-title')).toHaveText(
      'Acura Grand Prix of Long Beach'
    );
  });
});
