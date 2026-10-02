import { expect, test } from '@playwright/test';
import fs from 'fs';

// Playwright’s page queries carry the same names Testing Library’s render
// queries do; that library’s rule misreads them, so it is off for this file.
/* eslint-disable testing-library/prefer-screen-queries */

// RaceSync, driven end to end in a real browser against the read-only
// endpoints it consumes — every one of them answered here with the shapes the
// Jest suites already pin down (see App.test.js), so the page is exercised
// the only way jsdom cannot: real scrolling, real wheel, real pointer drags,
// and a real download.

const SESSION_ID = 's-italy';
const RACE = {
  id: SESSION_ID,
  meetingName: 'Italian Grand Prix',
  circuitName: 'Monza',
  country: 'Italy',
  season: 2021,
  type: 'Race',
  startTime: '2021-09-12T13:00:00Z',
  replayReady: true,
};

const FIELD = [
  { entryId: 'e1', driverName: 'Max VERSTAPPEN', teamName: 'Red Bull Racing', position: 1, gap: 0 },
  { entryId: 'e2', driverName: 'Lewis HAMILTON', teamName: 'Mercedes', position: 2, gap: 1.4 },
];

const TOTAL_LAPS = 4;
const TIMES = {
  VER: [90.92, 91.04, 90.8, 91.16],
  HAM: [91.32, 91.44, 91.2, 91.56],
};

function lapSeries() {
  return {
    sessionId: SESSION_ID,
    totalLaps: TOTAL_LAPS,
    drivers: [
      {
        entryId: 'e1',
        driverName: 'Max VERSTAPPEN',
        teamName: 'Red Bull Racing',
        lapTimeSeconds: TIMES.VER,
        position: [1, 1, 1, 1],
        compound: ['SOFT', 'SOFT', 'SOFT', 'SOFT'],
        stintNumber: [1, 1, 1, 1],
      },
      {
        entryId: 'e2',
        driverName: 'Lewis HAMILTON',
        teamName: 'Mercedes',
        lapTimeSeconds: TIMES.HAM,
        position: [2, 2, 2, 2],
        compound: ['MEDIUM', 'MEDIUM', 'MEDIUM', 'MEDIUM'],
        stintNumber: [1, 1, 1, 1],
      },
    ],
  };
}

// A simple closed loop, landscape by construction so buildGeometry keeps it
// as drawn: the shape only has to be a real trace-shaped answer.
const TRACK = {
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 60 },
    { x: 60, y: 60 },
    { x: 60, y: 20 },
    { x: 40, y: 20 },
    { x: 40, y: 60 },
    { x: 0, y: 60 },
  ],
};

const json = (body) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

// A one-pixel PNG — enough of an image answer for the headshots and badges,
// which only have to load, not look like anything.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

// The routes the page reads, answered as the backend would answer them: the
// fixture list, the lap-aware replay state, the circuit's shape, the lap
// series the panels read, the driver and team records the Driver Analysis
// card introduces people with (plus the proxy their photos load through) —
// and an auth check that says nobody is signed in, so the bell stays out of
// this spec's way.
async function mockRaceSync(page) {
  await page.route('**/api/fixtures', (route) => route.fulfill(json({ fixtures: [RACE] })));
  await page.route('**/api/drivers', (route) =>
    route.fulfill(
      json({
        drivers: [
          { id: 'd-ver', name: 'Max Verstappen', imageUrl: 'https://openf1.example/ver.png' },
          { id: 'd-ham', name: 'Lewis Hamilton', imageUrl: 'https://openf1.example/ham.png' },
        ],
      })
    )
  );
  await page.route('**/api/teams', (route) =>
    route.fulfill(
      json({
        teams: [
          { name: 'Red Bull Racing', logoUrl: 'https://cdn.example/rb.png' },
          { name: 'Mercedes', logoUrl: 'https://cdn.example/merc.png' },
        ],
      })
    )
  );
  await page.route('**/api/images**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX })
  );
  await page.route('https://cdn.example/*', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX })
  );
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"no session"}' })
  );
  await page.route(`**/api/race-replay/${SESSION_ID}/track-shape`, (route) =>
    route.fulfill(json(TRACK))
  );
  await page.route(`**/api/race-replay/${SESSION_ID}/lap-series`, (route) =>
    route.fulfill(json(lapSeries()))
  );
  await page.route(`**/api/race-replay/${SESSION_ID}/state*`, (route) => {
    const lap = Number(new URL(route.request().url()).searchParams.get('lap') ?? 0);
    return route.fulfill(
      json({
        lap,
        totalLaps: TOTAL_LAPS,
        atEnd: lap >= TOTAL_LAPS,
        leaderboard: FIELD,
      })
    );
  });
}

// From the guide to a live stage: focus the header's search, take the race
// the fixtures offered, and wait for the trace and the field to land.
async function pickRace(page) {
  await page.getByPlaceholder('Type Race Title...').click();
  await page.getByRole('option', { name: 'Italian Grand Prix 2021' }).click();
  const stage = page.getByLabel('Circuit map and driver positions');
  await expect(stage).toBeVisible();
  await expect(page.locator('.racesync-stage-car').filter({ hasText: 'VER' })).toBeVisible();
  return stage;
}

test.describe('RaceSync', () => {
  test('picks a race, follows the playhead, jumps the rail, and exports the readings', async ({
    page,
  }) => {
    await mockRaceSync(page);
    await page.goto('/sync-f1-broadcast');

    // The page opens on its instructions, having fetched no replay at all —
    // and the rail waits with it: the reading rows have nowhere to land.
    await expect(page.getByText('Don’t just watch the race. Read it.')).toBeVisible();
    await expect(page.getByText('pick a race first')).toHaveCount(4);
    await expect(page.getByText('no channel data')).toBeVisible();

    await pickRace(page);

    // A picked race is what the rows were waiting on.
    await expect(
      page.getByRole('button', { name: 'Lap Time Analysis' })
    ).not.toHaveAttribute('aria-disabled');

    // The workflow spine above the band: Observe is the live step, and
    // Simulate is honest about having no data behind it yet.
    const spine = page.getByRole('group', { name: 'Race workflow' });
    await expect(
      spine.getByRole('button', { name: /What happened/ })
    ).toHaveAttribute('aria-current', 'step');
    await expect(
      spine.getByRole('button', { name: /What if we changed it/ })
    ).toHaveAttribute('aria-disabled', 'true');
    await expect(spine.getByText('no simulation data')).toBeVisible();

    // Jumping to Diagnose scrolls the pace reading into view and moves the
    // red step marker onto the second phase.
    await spine.getByRole('button', { name: /Why did it happen/ }).click();
    await expect(page.locator('#racesync-section-driver-analysis')).toBeInViewport();
    await expect(
      spine.getByRole('button', { name: /Why did it happen/ })
    ).toHaveAttribute('aria-current', 'step');

    // Parked on the grid: the six series-based panels say so, and there is
    // nothing to export.
    await expect(page.getByText('No laps run yet.')).toHaveCount(6);
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled();

    // One lap forward — the transport's own chevron — and every reading on
    // the page follows the playhead. (The spine's stepper says “Jump forward
    // one lap”, which Playwright's substring name matching would also pick
    // up without the exact:)
    await page.getByRole('button', { name: 'Forward one lap', exact: true }).click();
    await expect(page.getByLabel('Lap', { exact: true })).toHaveValue('1');
    await expect(page.locator('.racesync-panels-scope')).toHaveText('Whole field');
    await expect(
      page.locator('.racesync-panel', { hasText: 'Pace & Key Metrics' }).getByText('1:30.920', {
        exact: true,
      })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeEnabled();

    // The Driver Analysis card introduces the leader with the app's own
    // records — Verstappen's headshot through the image proxy, the Red Bull
    // badge beside his name — and reads his lap against the field: four
    // tenths off the best average, and an honest note where a one-lap stint
    // cannot measure tyre wear yet.
    const analysis = page.getByRole('region', { name: 'Driver Analysis' });
    await expect(analysis.getByRole('heading', { name: 'Max Verstappen' })).toBeVisible();
    await expect(analysis.getByRole('img', { name: 'Max Verstappen' })).toBeVisible();
    await expect(analysis.getByRole('img', { name: 'Red Bull Racing' })).toBeVisible();
    await expect(analysis.getByText('+0.400 to best avg')).toBeVisible();
    await expect(analysis.getByText('needs a longer stint')).toBeVisible();

    // A rail row is a jump within the page: the lap-time reading scrolls
    // into view, clear of the header.
    await page.getByRole('button', { name: 'Lap Time Analysis' }).click();
    await expect(page.locator('#racesync-section-lap-time')).toBeInViewport();

    // The export is cut at the playhead: one lap played, one lap in the file.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('italian-grand-prix-through-lap-1.csv');
    const contents = fs.readFileSync(await download.path(), 'utf8');
    expect(contents.split('\n')).toEqual([
      'lap,driver,team,position,lap_time_s,compound,stint',
      '1,Max VERSTAPPEN,Red Bull Racing,1,90.920,SOFT,1',
      '1,Lewis HAMILTON,Mercedes,2,91.320,MEDIUM,1',
      '',
    ]);
  });

  test('zooms and pans the map from the buttons, the wheel and the drag', async ({ page }) => {
    await mockRaceSync(page);
    await page.goto('/sync-f1-broadcast');
    await pickRace(page);

    // The spine's stepper rides the same lap clock as the band's chevrons,
    // and its replay mark flips to Restart once the race runs — the same
    // three-state honesty as the band's red mark.
    const spine = page.getByRole('group', { name: 'Race workflow' });
    await expect(spine.getByText('0 / 4')).toBeVisible();
    await spine.getByRole('button', { name: 'Jump forward one lap' }).click();
    await expect(page.getByLabel('Lap', { exact: true })).toHaveValue('1');
    await expect(spine.getByRole('button', { name: 'Jump back one lap' })).toBeEnabled();
    await spine.getByRole('button', { name: 'Play the race' }).click();
    await expect(spine.getByRole('button', { name: 'Restart the race' })).toBeVisible();
    await page.getByRole('button', { name: 'Pause the replay' }).click();

    const zoombar = page.getByRole('group', { name: 'Map zoom' });
    await expect(zoombar.getByText('1.0×')).toBeVisible();
    await expect(zoombar.getByRole('button', { name: 'Zoom the map out' })).toBeDisabled();
    await expect(zoombar.getByRole('button', { name: 'Reset the map view' })).toBeDisabled();

    // The buttons zoom around the centre of the frame.
    await zoombar.getByRole('button', { name: 'Zoom the map in' }).click();
    await expect(zoombar.getByText('1.6×')).toBeVisible();

    // Ctrl + wheel zooms under the cursor — the gesture the browser would
    // otherwise answer with a page zoom.
    const map = page.locator('.racesync-stage-map');
    const box = await map.boundingBox();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -240);
    await page.keyboard.up('Control');
    await expect(zoombar.getByText('2.6×')).toBeVisible();

    // A drag pans, and the pan is held exactly where the drag left it: the
    // transform afterwards is the one before, moved by the drag itself.
    const readZoom = () =>
      page.locator('.racesync-stage-zoom').evaluate((el) => {
        const match = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform);
        return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
      });
    const before = await readZoom();
    await page.mouse.down();
    await page.mouse.move(centerX + 120, centerY + 60, { steps: 5 });
    await page.mouse.up();
    const after = await readZoom();
    expect(after.x - before.x).toBeCloseTo(120, 1);
    expect(after.y - before.y).toBeCloseTo(60, 1);

    // And the reset hands the fitted view back.
    await zoombar.getByRole('button', { name: 'Reset the map view' }).click();
    await expect(zoombar.getByText('1.0×')).toBeVisible();
    await expect(zoombar.getByRole('button', { name: 'Zoom the map out' })).toBeDisabled();
  });
});
