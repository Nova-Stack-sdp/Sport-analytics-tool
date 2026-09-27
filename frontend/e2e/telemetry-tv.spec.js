import { expect, test } from '@playwright/test';

test.describe('TelemetryTV', () => {
  test('shows the dashboard shell without loading an F1 video or telemetry endpoint', async ({ page }) => {
    const telemetryRequests = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/telemetry-tv')) telemetryRequests.push(request.url());
    });
    await page.goto('/telemetry-tv');

    await expect(page.getByText('Video source not configured')).toBeVisible();
    await expect(page.locator('.masterboard-empty-state')).toHaveText('Telemetry feed not configured.');
    await expect(page.getByTitle('YouTube video player')).toHaveCount(0);
    expect(telemetryRequests).toEqual([]);

    await page.getByLabel('Season').fill('2024');
    await page.getByLabel('Grand Prix name contains').fill('Monaco');
    await page.getByRole('button', { name: 'Find race' }).focus();
    await expect(page.getByRole('button', { name: 'Find race' })).toBeFocused();
  });
});