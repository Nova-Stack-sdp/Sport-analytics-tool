# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: watch-live.spec.js >> Watch Live >> shows a backend error without horizontal overflow
- Location: e2e\watch-live.spec.js:64:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/Request to \/api\/watch-live\/state failed with status 503/i)
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText(/Request to \/api\/watch-live\/state failed with status 503/i) with timeout 5000ms
  - waiting for getByText(/Request to \/api\/watch-live\/state failed with status 503/i)

```

```yaml
- link "F1 Analytics":
  - /url: /
- link "Overview":
  - /url: /overview
- link "Fixtures & Events":
  - /url: /fixtures
- link "Statistics":
  - /url: /statistics
- link "Teams":
  - /url: /teams
- link "Drivers":
  - /url: /drivers
- link "Time-Travel":
  - /url: /timetravel
- link "Race Replay":
  - /url: /replay
- link "LIVE":
  - /url: /watch-live
- text: 2026 Season ▾
- button "☀"
- link "SignIn":
  - /url: /sign-in
- text: Session Setup & Sync 1. find race - 2. sync clock Season
- spinbutton "Season"
- text: Grand Prix name contains
- textbox "Grand Prix name contains":
  - /placeholder: e.g. Monaco
- button "Find race"
- text: Session replay Playback-synchronized feed Awaiting playback
- iframe
- text: Race mode
- strong: Unavailable
- text: Lap
- strong: "-- / --"
- text: Weather
- strong: Unavailable
- text: Race clock --:-- Lap -- Lap Intensity ○ Awaiting sync Awaiting commentary… Masterboard Current race order, speed, strategy, and momentum Playback time Find a race above, load its telemetry, then sync the clock. Battle Radar Front, midfield, and back action Race dynamics Load and sync a race to see battle dynamics.
- contentinfo:
  - text: WIRE
  - paragraph: "Data sources: OpenF1 community/unofficial data, heuristic momentum/battle predictions, third-party YouTube video used only as a synced visual reference."
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | 
  3  | const SAMPLE_STATE = {
  4  |   videoSeconds: 12,
  5  |   session: {
  6  |     meetingName: 'Spanish Grand Prix',
  7  |     sessionName: 'Race',
  8  |     currentLap: 4,
  9  |     totalLaps: 66,
  10 |   },
  11 |   weather: { airTemperature: 24, rainfall: 0 },
  12 |   recentAnchors: [{ description: 'Hamilton closes the gap into turn one.' }],
  13 |   leaderboard: [
  14 |     {
  15 |       driverNumber: 44,
  16 |       position: 1,
  17 |       driverName: 'Lewis Hamilton',
  18 |       teamName: 'Ferrari',
  19 |       lastLapTime: 91.2,
  20 |       gapToAhead: 0,
  21 |       speedKph: 314,
  22 |       tyreCompound: 'MEDIUM',
  23 |       gridDelta: 2,
  24 |     },
  25 |   ],
  26 | };
  27 | 
  28 | async function stubWatchLive(page, response = { snapshots: [SAMPLE_STATE], bufferStartSeconds: 0, bufferEndSeconds: 30 }) {
  29 |   await page.route('**/api/watch-live/state*', (route) => route.fulfill({
  30 |     status: 200,
  31 |     contentType: 'application/json',
  32 |     body: JSON.stringify(response),
  33 |   }));
  34 | 
  35 |   await page.route('https://www.youtube.com/iframe_api', (route) => route.fulfill({
  36 |     contentType: 'application/javascript',
  37 |     body: `window.YT = {
  38 |       PlayerState: { PLAYING: 1 },
  39 |       Player: function(element, options) {
  40 |         this.getCurrentTime = function() { return 12.8; };
  41 |         this.destroy = function() {};
  42 |         setTimeout(function() { options.events.onStateChange({ data: 1 }); }, 0);
  43 |       }
  44 |     };
  45 |     window.onYouTubeIframeAPIReady();`,
  46 |   }));
  47 | }
  48 | 
  49 | test.describe('Watch Live', () => {
  50 |   test('loads synchronized telemetry and exposes keyboard-accessible setup controls', async ({ page }) => {
  51 |     await stubWatchLive(page);
  52 |     await page.goto('/watch-live');
  53 | 
  54 |     await expect(page.getByText('Spanish Grand Prix')).toBeVisible();
  55 |     await expect(page.getByText('Lewis Hamilton')).toBeVisible();
  56 |     await expect(page.getByText('Hamilton closes the gap into turn one.')).toBeVisible();
  57 | 
  58 |     await page.getByLabel('Season').fill('2024');
  59 |     await page.getByLabel('Grand Prix name contains').fill('Monaco');
  60 |     await page.getByRole('button', { name: 'Find race' }).focus();
  61 |     await expect(page.getByRole('button', { name: 'Find race' })).toBeFocused();
  62 |   });
  63 | 
  64 |   test('shows a backend error without horizontal overflow', async ({ page }) => {
  65 |     await page.route('**/api/watch-live/state*', (route) => route.fulfill({
  66 |       status: 503,
  67 |       contentType: 'application/json',
  68 |       body: JSON.stringify({ error: 'not available' }),
  69 |     }));
  70 |     await page.route('https://www.youtube.com/iframe_api', (route) => route.fulfill({
  71 |       contentType: 'application/javascript',
  72 |       body: `window.YT = {
  73 |         PlayerState: { PLAYING: 1 },
  74 |         Player: function(element, options) {
  75 |           this.getCurrentTime = function() { return 12.8; };
> 76 |           this.destroy = function() {};
     |                                                                                                 ^ Error: expect(locator).toBeVisible() failed
  77 |           setTimeout(function() { options.events.onStateChange({ data: 1 }); }, 0);
  78 |         }
  79 |       };
  80 |       window.onYouTubeIframeAPIReady();`,
  81 |     }));
  82 |     await page.goto('/watch-live');
  83 | 
  84 |     await expect(page.getByText(/Request to \/api\/watch-live\/state failed with status 503/i)).toBeVisible();
  85 |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  86 |   });
  87 | });
```