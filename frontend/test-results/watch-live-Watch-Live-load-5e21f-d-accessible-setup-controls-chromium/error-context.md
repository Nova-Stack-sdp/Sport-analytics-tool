# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: watch-live.spec.js >> Watch Live >> loads synchronized telemetry and exposes keyboard-accessible setup controls
- Location: e2e\watch-live.spec.js:50:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Lewis Hamilton')
Expected: visible
Error: strict mode violation: getByText('Lewis Hamilton') resolved to 6 elements:
    1) <span>Lewis Hamilton</span> aka getByRole('table').getByText('Lewis Hamilton')
    2) <div class="pulse-stat-value">Lewis Hamilton</div> aka getByText('Lewis Hamilton').nth(1)
    3) <div class="pulse-stat-value">Lewis Hamilton</div> aka getByText('Lewis Hamilton').nth(2)
    4) <span>Lewis Hamilton</span> aka getByText('Lewis Hamilton').nth(3)
    5) <span>Lewis Hamilton</span> aka getByText('Lewis Hamilton').nth(4)
    6) <span>Lewis Hamilton</span> aka getByText('Lewis Hamilton').nth(5)

Call log:
  - Expect "toBeVisible" getByText('Lewis Hamilton') with timeout 5000ms
  - waiting for getByText('Lewis Hamilton')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic "Main navigation" [ref=e4]:
    - generic [ref=e5]:
      - link "F1 Analytics" [ref=e6] [cursor=pointer]:
        - /url: /
        - generic [ref=e7]: F1
        - generic [ref=e8]: Analytics
      - generic [ref=e9]:
        - link "Overview" [ref=e10] [cursor=pointer]:
          - /url: /overview
        - link "Fixtures & Events" [ref=e11] [cursor=pointer]:
          - /url: /fixtures
        - link "Statistics" [ref=e12] [cursor=pointer]:
          - /url: /statistics
        - link "Teams" [ref=e13] [cursor=pointer]:
          - /url: /teams
        - link "Drivers" [ref=e14] [cursor=pointer]:
          - /url: /drivers
        - link "Time-Travel" [ref=e15] [cursor=pointer]:
          - /url: /timetravel
        - link "Race Replay" [ref=e16] [cursor=pointer]:
          - /url: /replay
      - generic [ref=e17]:
        - link "LIVE" [ref=e18] [cursor=pointer]:
          - /url: /watch-live
        - generic [ref=e19]: 2026 Season ▾
        - button "☀" [ref=e20] [cursor=pointer]
        - link "SignIn" [ref=e22] [cursor=pointer]:
          - /url: /sign-in
  - generic [ref=e24]:
    - generic [ref=e26]:
      - generic [ref=e27]:
        - generic [ref=e28]: Session Setup & Sync
        - generic [ref=e29]: 1. find race - 2. sync clock
      - generic [ref=e30]:
        - generic [ref=e31]:
          - generic [ref=e32]: Season
          - spinbutton "Season" [ref=e33]
        - generic [ref=e34]:
          - generic [ref=e35]: Grand Prix name contains
          - textbox "Grand Prix name contains" [ref=e36]:
            - /placeholder: e.g. Monaco
        - button "Find race" [ref=e37] [cursor=pointer]
    - generic [ref=e38]:
      - generic [ref=e39]:
        - generic [ref=e40]:
          - generic [ref=e41]:
            - generic [ref=e42]:
              - generic [ref=e43]: Spanish Grand Prix
              - generic [ref=e44]: Playback-synchronized feed
            - generic [ref=e45]: Synchronized
          - iframe [ref=e47]:
            - generic [ref=f1e1]:
              - generic "YouTube Video Player" [ref=f1e3]
              - generic [ref=f1e5]:
                - generic:
                  - generic:
                    - generic [ref=f1e6] [cursor=pointer]
                    - button "Play video" [ref=f1e10] [cursor=pointer]
                    - button "Hide player controls" [ref=f1e14] [cursor=pointer]
                    - generic [ref=f1e16]:
                      - generic [ref=f1e21]:
                        - generic [ref=f1e22]:
                          - link "F1 Barcelona-Catalunya Grand Prix 2026 FULL RACE PART 1" [ref=f1e23] [cursor=pointer]:
                            - /url: https://www.youtube.com/watch?v=O3oYzBXzAIs
                          - link "Motorsport Guy" [ref=f1e24] [cursor=pointer]:
                            - /url: /channel/UC8AisWWLPNHmdKAt0mF91Fw
                        - generic [ref=f1e26]:
                          - button [ref=f1e27] [cursor=pointer]:
                            - img "thumbnail-image" [ref=f1e28]
                          - generic [ref=f1e30]:
                            - generic: Motorsport Guy
                            - generic: 485 subscribers
                      - generic [ref=f1e31]:
                        - button "Share" [ref=f1e34] [cursor=pointer]
                        - link "Watch on YouTube" [ref=f1e45] [cursor=pointer]:
                          - /url: https://www.youtube.com/watch?v=O3oYzBXzAIs
                          - generic [ref=f1e46]: Watch on
          - generic [ref=e48]:
            - generic [ref=e49]:
              - generic [ref=e50]: Race mode
              - strong [ref=e51]: Race
            - generic [ref=e52]:
              - generic [ref=e53]: Lap
              - strong [ref=e54]: 4 / 66
            - generic [ref=e55]:
              - generic [ref=e56]: Weather
              - strong [ref=e57]: 24°C / Dry
        - generic [ref=e58]:
          - generic [ref=e59]:
            - generic [ref=e60]:
              - generic [ref=e61]: Race clock
              - generic [ref=e62]: 0:12
            - generic [ref=e63]:
              - generic [ref=e64]: Lap
              - generic [ref=e65]: Lap 4/66
            - generic [ref=e66]: Intensity
          - generic [ref=e69]: ✓ Synced
        - generic [ref=e72]: Hamilton closes the gap into turn one.
      - generic [ref=e76]:
        - generic [ref=e77]:
          - generic [ref=e78]:
            - generic [ref=e79]: Masterboard
            - generic [ref=e80]: Current race order, speed, strategy, and momentum
          - generic [ref=e81]: Playback time
        - table [ref=e83]:
          - rowgroup [ref=e84]:
            - row [ref=e85]:
              - columnheader "#" [ref=e86]
              - columnheader "Driver" [ref=e87]
              - columnheader "Team" [ref=e88]
              - columnheader "Lap" [ref=e89]
              - columnheader "Gap" [ref=e90]
              - columnheader "Speed" [ref=e91]
              - columnheader "Tire" [ref=e92]
              - columnheader "Grid" [ref=e93]
              - columnheader "Trend" [ref=e94]
          - rowgroup [ref=e95]:
            - row [ref=e96]:
              - cell "1" [ref=e97]
              - cell "Lewis Hamilton" [ref=e98]
              - cell "Ferrari" [ref=e101]
              - cell "1:31.200" [ref=e102]
              - cell "LEADER" [ref=e103]
              - cell "314 km/h" [ref=e104]
              - cell "MEDIUM" [ref=e105]
              - cell "+2" [ref=e107]
              - cell "--" [ref=e108]
    - generic [ref=e109]:
      - generic [ref=e110]:
        - generic [ref=e111]:
          - generic [ref=e112]: Race Pulse
          - generic [ref=e113]: Key stats from the track right now
        - generic [ref=e114]: Live
      - generic [ref=e115]:
        - generic [ref=e116]:
          - generic [ref=e117]: Biggest Mover
          - generic [ref=e118]: Lewis Hamilton
          - generic [ref=e119]: +2 places from grid
        - generic [ref=e120]:
          - generic [ref=e121]: Closest Battle
          - generic [ref=e122]: "--"
          - generic [ref=e123]: Spreading out
        - generic [ref=e124]:
          - generic [ref=e125]: Fastest Last Lap
          - generic [ref=e126]: Lewis Hamilton
          - generic [ref=e127]: 1:31.200
        - generic [ref=e128]:
          - generic [ref=e129]: Leader's Pace
          - generic [ref=e130]: 1:31.200
          - generic [ref=e131]: Last lap by P1
    - generic [ref=e132]:
      - generic [ref=e133]:
        - generic [ref=e134]:
          - generic [ref=e135]: Battle Radar
          - generic [ref=e136]: Gap to car ahead and pace needed to overtake
        - generic [ref=e137]: Race dynamics
      - generic [ref=e138]:
        - generic [ref=e139]:
          - generic [ref=e140]: Front
          - generic [ref=e141]:
            - generic [ref=e142]: Lewis Hamilton
            - generic [ref=e145]:
              - generic [ref=e146]: Position
              - strong [ref=e147]: P1
            - generic [ref=e148]:
              - generic [ref=e149]: Gap to ahead
              - strong [ref=e150]: LEADER
            - generic [ref=e151]:
              - generic [ref=e152]: Tyre
              - strong [ref=e153]: MEDIUM
            - generic [ref=e154]: In clear air — setting the pace
        - generic [ref=e155]:
          - generic [ref=e156]: Midfield
          - generic [ref=e157]:
            - generic [ref=e158]: Lewis Hamilton
            - generic [ref=e161]:
              - generic [ref=e162]: Position
              - strong [ref=e163]: P1
            - generic [ref=e164]:
              - generic [ref=e165]: Gap to ahead
              - strong [ref=e166]: LEADER
            - generic [ref=e167]:
              - generic [ref=e168]: Tyre
              - strong [ref=e169]: MEDIUM
            - generic [ref=e170]: In clear air — setting the pace
        - generic [ref=e171]:
          - generic [ref=e172]: Back
          - generic [ref=e173]:
            - generic [ref=e174]: Lewis Hamilton
            - generic [ref=e177]:
              - generic [ref=e178]: Position
              - strong [ref=e179]: P1
            - generic [ref=e180]:
              - generic [ref=e181]: Gap to ahead
              - strong [ref=e182]: LEADER
            - generic [ref=e183]:
              - generic [ref=e184]: Tyre
              - strong [ref=e185]: MEDIUM
            - generic [ref=e186]: In clear air — setting the pace
    - contentinfo [ref=e187]:
      - generic [ref=e188]:
        - generic [ref=e189]: WIRE
        - paragraph [ref=e192]: "Data sources: OpenF1 community/unofficial data, heuristic momentum/battle predictions, third-party YouTube video used only as a synced visual reference."
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
> 55 |     await expect(page.getByText('Lewis Hamilton')).toBeVisible();
     |                                                    ^ Error: expect(locator).toBeVisible() failed
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
  76 |           this.destroy = function() {};
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