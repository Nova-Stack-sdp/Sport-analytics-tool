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
    slug: 'indianapolis-500-2024',
    eventName: '108th Running of the Indianapolis 500',
    sessionDate: '5/26/2024',
    totalLaps: 200,
    fieldSize: 33,
    video: { youtubeId: 'fWwonhySrWg', embedStartSeconds: 10353, videoDurationSeconds: 20625 },
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

    await raceSelect.selectOption('indianapolis-500-2024');

    await expect(page.locator('.video-embed iframe')).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/fWwonhySrWg?enablejsapi=1&playsinline=1&start=10353'
    );
    await expect(page.locator('.video-panel .card-title')).toHaveText(
      '108th Running of the Indianapolis 500'
    );
  });
});
