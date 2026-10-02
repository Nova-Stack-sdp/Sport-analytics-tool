# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: race-sync.spec.js >> RaceSync >> picks a race, follows the playhead, jumps the rail, and exports the readings
- Location: e2e\race-sync.spec.js:160:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('region', { name: 'Driver Analysis' }).getByText('+0.400 to best avg')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('region', { name: 'Driver Analysis' }).getByText('+0.400 to best avg') with timeout 5000ms
  - waiting for getByRole('region', { name: 'Driver Analysis' }).getByText('+0.400 to best avg')

```

```yaml
- banner:
  - link "RaceSync Observe, Diagnose, Simulate":
    - /url: /
  - combobox "Search races"
  - button "Choose what to see"
- navigation "RaceSync sections":
  - button "Collapse RaceSync navigation" [expanded]
  - list:
    - listitem:
      - button "Race Overview"
    - listitem:
      - button "Driver Analysis"
    - listitem:
      - button "Strategy & Pit Stops"
    - listitem:
      - button "Telemetry no channel data" [disabled]
    - listitem:
      - button "Lap Time Analysis"
    - listitem:
      - button "Segment Analysis no sector times" [disabled]
    - listitem:
      - button "Comparison"
    - listitem:
      - button "Reports not generated" [disabled]
  - link "Back to TelemetryTV":
    - /url: /telemetry-tv
  - paragraph: Better data. Sharper decisions. Faster laps.
- main:
  - region "Circuit map and driver positions":
    - group "Race workflow":
      - list:
        - listitem:
          - button "Observe What happened?"
        - listitem:
          - button "Diagnose Why did it happen?"
        - listitem:
          - button "Simulate What if we changed it? no simulation data" [disabled]
      - group "Jump to lap":
        - text: Jump to Lap
        - button "Jump back one lap"
        - text: 1 / 4
        - button "Jump forward one lap"
      - button "Play the race": Play
    - img "Italy"
    - heading "Italian Grand Prix" [level=2]
    - paragraph: Monza · Italy · 12 Sep 2021 · Race
    - button "Back one lap"
    - button "Resume the replay": ▶
    - button "Replay speed 1×": 1×
    - button "Forward one lap"
    - button "Play the replay": Play
    - text: Lap
    - textbox "Lap": "1"
    - text: / 4 Time remaining 3 Laps
    - region "Race analysis panels":
      - region "Race State":
        - heading "Race State" [level=3]
        - text: Lap 1
        - table:
          - rowgroup:
            - row "Pos Driver Int Tyre Last lap Stops":
              - columnheader "Pos"
              - columnheader "Driver"
              - columnheader "Int"
              - columnheader "Tyre"
              - columnheader "Last lap"
              - columnheader "Stops"
          - rowgroup:
            - row "1 VER Max Verstappen — — — 0":
              - cell "1"
              - cell "VER Max Verstappen"
              - cell "—"
              - cell "—"
              - cell "—"
              - cell "0"
            - row "2 HAM Lewis Hamilton — — — 0":
              - cell "2"
              - cell "HAM Lewis Hamilton"
              - cell "—"
              - cell "—"
              - cell "—"
              - cell "0"
      - region "Pace & Key Metrics":
        - heading "Pace & Key Metrics" [level=3]
        - text: 2 in view
        - term: Fastest lap
        - definition: 1:30.920 VER
        - term: Pace spread
        - definition: 0.400s best to slowest
        - term: Pit stops
        - definition: 0 in view
        - term: Laps run
        - definition: 1 of 4
        - list:
          - listitem: VER 1:30.920
          - listitem: HAM 1:31.320 +0.400
        - paragraph: Best lap per driver, with the spread between the comparison’s quickest and slowest best laps setting the bar lengths.
      - text: S1 S2 S3 VER HAM
      - group "Map zoom":
        - button "Zoom the map in"
        - button "Zoom the map out" [disabled]
        - text: 1.0×
        - button "Reset the map view" [disabled]
      - list:
        - listitem: VER Max Verstappen
        - listitem: HAM Lewis Hamilton
      - region "Tyre Stints":
        - heading "Tyre Stints" [level=3]
        - text: Lap 1
        - list:
          - listitem: VER S 1 1 lap
          - listitem: HAM M 1 1 lap
      - region "Pit Stops":
        - heading "Pit Stops" [level=3]
        - paragraph: No stops yet.
      - region "Driver Analysis":
        - heading "Driver Analysis" [level=3]
        - text: race leader
        - img "Max Verstappen"
        - heading "Max Verstappen" [level=4]
        - paragraph:
          - img "Red Bull Racing"
          - text: Red Bull Racing
        - term: Avg pace
        - definition: 1:30.920 +0.000 to best avg
        - term: Best lap
        - definition: 1:30.920 Lap 1
        - term: Tyre degradation
        - definition: — needs a longer stint
        - term: Stint lengths
        - definition: 1 0 stops
        - list:
          - listitem: Best lap L1 — 1:30.920
        - text: Recommended strategy no simulation data
        - button "Run Simulation" [disabled]
      - heading "Race analysis" [level=3]
      - text: Whole field
      - button "Export CSV"
      - region "Lap Time Delta":
        - heading "Lap Time Delta" [level=3]
        - text: Quickest 1:30.920
        - img "Lap time delta — 2 drivers"
        - text: 1 Lap 1 4
        - list:
          - listitem: VER
          - listitem: HAM
        - paragraph: One line per driver in view, each lap measured against the quickest lap in this comparison. Corner-level braking and traction aren’t in the synced data for any session, so the laps themselves are the breakdown — a spike is a slow lap, and the stops above are where the spikes are.
      - region "Twin Line":
        - heading "Twin Line" [level=3]
        - text: VER vs HAM VER Max Verstappen 1:30.920 best · 1 lap HAM Lewis Hamilton 1:31.320 best · 1 lap
        - img "Lap times — 2 drivers"
        - text: 1 Lap 1 4
        - paragraph: "Lap times, not telemetry: no speed, brake, gear or DRS channels are synced for these sessions, so two drivers’ laps are the twin reading this data can honestly draw."
```

# Test source

```ts
  126 |   await page.route('**/api/auth/me', (route) =>
  127 |     route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"no session"}' })
  128 |   );
  129 |   await page.route(`**/api/race-replay/${SESSION_ID}/track-shape`, (route) =>
  130 |     route.fulfill(json(TRACK))
  131 |   );
  132 |   await page.route(`**/api/race-replay/${SESSION_ID}/lap-series`, (route) =>
  133 |     route.fulfill(json(lapSeries()))
  134 |   );
  135 |   await page.route(`**/api/race-replay/${SESSION_ID}/state*`, (route) => {
  136 |     const lap = Number(new URL(route.request().url()).searchParams.get('lap') ?? 0);
  137 |     return route.fulfill(
  138 |       json({
  139 |         lap,
  140 |         totalLaps: TOTAL_LAPS,
  141 |         atEnd: lap >= TOTAL_LAPS,
  142 |         leaderboard: FIELD,
  143 |       })
  144 |     );
  145 |   });
  146 | }
  147 | 
  148 | // From the guide to a live stage: focus the header's search, take the race
  149 | // the fixtures offered, and wait for the trace and the field to land.
  150 | async function pickRace(page) {
  151 |   await page.getByPlaceholder('Type Race Title...').click();
  152 |   await page.getByRole('option', { name: 'Italian Grand Prix 2021' }).click();
  153 |   const stage = page.getByLabel('Circuit map and driver positions');
  154 |   await expect(stage).toBeVisible();
  155 |   await expect(page.locator('.racesync-stage-car').filter({ hasText: 'VER' })).toBeVisible();
  156 |   return stage;
  157 | }
  158 | 
  159 | test.describe('RaceSync', () => {
  160 |   test('picks a race, follows the playhead, jumps the rail, and exports the readings', async ({
  161 |     page,
  162 |   }) => {
  163 |     await mockRaceSync(page);
  164 |     await page.goto('/sync-f1-broadcast');
  165 | 
  166 |     // The page opens on its instructions, having fetched no replay at all —
  167 |     // and the rail waits with it: the reading rows have nowhere to land.
  168 |     await expect(page.getByText('Don’t just watch the race. Read it.')).toBeVisible();
  169 |     await expect(page.getByText('pick a race first')).toHaveCount(4);
  170 |     await expect(page.getByText('no channel data')).toBeVisible();
  171 | 
  172 |     await pickRace(page);
  173 | 
  174 |     // A picked race is what the rows were waiting on.
  175 |     await expect(
  176 |       page.getByRole('button', { name: 'Lap Time Analysis' })
  177 |     ).not.toHaveAttribute('aria-disabled');
  178 | 
  179 |     // The workflow spine above the band: Observe is the live step, and
  180 |     // Simulate is honest about having no data behind it yet.
  181 |     const spine = page.getByRole('group', { name: 'Race workflow' });
  182 |     await expect(
  183 |       spine.getByRole('button', { name: /What happened/ })
  184 |     ).toHaveAttribute('aria-current', 'step');
  185 |     await expect(
  186 |       spine.getByRole('button', { name: /What if we changed it/ })
  187 |     ).toHaveAttribute('aria-disabled', 'true');
  188 |     await expect(spine.getByText('no simulation data')).toBeVisible();
  189 | 
  190 |     // Jumping to Diagnose scrolls the pace reading into view and moves the
  191 |     // red step marker onto the second phase.
  192 |     await spine.getByRole('button', { name: /Why did it happen/ }).click();
  193 |     await expect(page.locator('#racesync-section-driver-analysis')).toBeInViewport();
  194 |     await expect(
  195 |       spine.getByRole('button', { name: /Why did it happen/ })
  196 |     ).toHaveAttribute('aria-current', 'step');
  197 | 
  198 |     // Parked on the grid: the six series-based panels say so, and there is
  199 |     // nothing to export.
  200 |     await expect(page.getByText('No laps run yet.')).toHaveCount(6);
  201 |     await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  202 | 
  203 |     // One lap forward — the transport's own chevron — and every reading on
  204 |     // the page follows the playhead. (The spine's stepper says “Jump forward
  205 |     // one lap”, which Playwright's substring name matching would also pick
  206 |     // up without the exact:)
  207 |     await page.getByRole('button', { name: 'Forward one lap', exact: true }).click();
  208 |     await expect(page.getByLabel('Lap', { exact: true })).toHaveValue('1');
  209 |     await expect(page.locator('.racesync-panels-scope')).toHaveText('Whole field');
  210 |     await expect(
  211 |       page.locator('.racesync-panel', { hasText: 'Pace & Key Metrics' }).getByText('1:30.920', {
  212 |         exact: true,
  213 |       })
  214 |     ).toBeVisible();
  215 |     await expect(page.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
  216 | 
  217 |     // The Driver Analysis card introduces the leader with the app's own
  218 |     // records — Verstappen's headshot through the image proxy, the Red Bull
  219 |     // badge beside his name — and reads his lap against the field: four
  220 |     // tenths off the best average, and an honest note where a one-lap stint
  221 |     // cannot measure tyre wear yet.
  222 |     const analysis = page.getByRole('region', { name: 'Driver Analysis' });
  223 |     await expect(analysis.getByRole('heading', { name: 'Max Verstappen' })).toBeVisible();
  224 |     await expect(analysis.getByRole('img', { name: 'Max Verstappen' })).toBeVisible();
  225 |     await expect(analysis.getByRole('img', { name: 'Red Bull Racing' })).toBeVisible();
> 226 |     await expect(analysis.getByText('+0.400 to best avg')).toBeVisible();
      |                                                            ^ Error: expect(locator).toBeVisible() failed
  227 |     await expect(analysis.getByText('needs a longer stint')).toBeVisible();
  228 | 
  229 |     // A rail row is a jump within the page: the lap-time reading scrolls
  230 |     // into view, clear of the header.
  231 |     await page.getByRole('button', { name: 'Lap Time Analysis' }).click();
  232 |     await expect(page.locator('#racesync-section-lap-time')).toBeInViewport();
  233 | 
  234 |     // The export is cut at the playhead: one lap played, one lap in the file.
  235 |     const [download] = await Promise.all([
  236 |       page.waitForEvent('download'),
  237 |       page.getByRole('button', { name: 'Export CSV' }).click(),
  238 |     ]);
  239 |     expect(download.suggestedFilename()).toBe('italian-grand-prix-through-lap-1.csv');
  240 |     const contents = fs.readFileSync(await download.path(), 'utf8');
  241 |     expect(contents.split('\n')).toEqual([
  242 |       'lap,driver,team,position,lap_time_s,compound,stint',
  243 |       '1,Max VERSTAPPEN,Red Bull Racing,1,90.920,SOFT,1',
  244 |       '1,Lewis HAMILTON,Mercedes,2,91.320,MEDIUM,1',
  245 |       '',
  246 |     ]);
  247 |   });
  248 | 
  249 |   test('zooms and pans the map from the buttons, the wheel and the drag', async ({ page }) => {
  250 |     await mockRaceSync(page);
  251 |     await page.goto('/sync-f1-broadcast');
  252 |     await pickRace(page);
  253 | 
  254 |     // The spine's stepper rides the same lap clock as the band's chevrons,
  255 |     // and its replay mark flips to Restart once the race runs — the same
  256 |     // three-state honesty as the band's red mark.
  257 |     const spine = page.getByRole('group', { name: 'Race workflow' });
  258 |     await expect(spine.getByText('0 / 4')).toBeVisible();
  259 |     await spine.getByRole('button', { name: 'Jump forward one lap' }).click();
  260 |     await expect(page.getByLabel('Lap', { exact: true })).toHaveValue('1');
  261 |     await expect(spine.getByRole('button', { name: 'Jump back one lap' })).toBeEnabled();
  262 |     await spine.getByRole('button', { name: 'Play the race' }).click();
  263 |     await expect(spine.getByRole('button', { name: 'Restart the race' })).toBeVisible();
  264 |     await page.getByRole('button', { name: 'Pause the replay' }).click();
  265 | 
  266 |     const zoombar = page.getByRole('group', { name: 'Map zoom' });
  267 |     await expect(zoombar.getByText('1.0×')).toBeVisible();
  268 |     await expect(zoombar.getByRole('button', { name: 'Zoom the map out' })).toBeDisabled();
  269 |     await expect(zoombar.getByRole('button', { name: 'Reset the map view' })).toBeDisabled();
  270 | 
  271 |     // The buttons zoom around the centre of the frame.
  272 |     await zoombar.getByRole('button', { name: 'Zoom the map in' }).click();
  273 |     await expect(zoombar.getByText('1.6×')).toBeVisible();
  274 | 
  275 |     // Ctrl + wheel zooms under the cursor — the gesture the browser would
  276 |     // otherwise answer with a page zoom.
  277 |     const map = page.locator('.racesync-stage-map');
  278 |     const box = await map.boundingBox();
  279 |     const centerX = box.x + box.width / 2;
  280 |     const centerY = box.y + box.height / 2;
  281 |     await page.mouse.move(centerX, centerY);
  282 |     await page.keyboard.down('Control');
  283 |     await page.mouse.wheel(0, -240);
  284 |     await page.keyboard.up('Control');
  285 |     await expect(zoombar.getByText('2.6×')).toBeVisible();
  286 | 
  287 |     // A drag pans, and the pan is held exactly where the drag left it: the
  288 |     // transform afterwards is the one before, moved by the drag itself.
  289 |     const readZoom = () =>
  290 |       page.locator('.racesync-stage-zoom').evaluate((el) => {
  291 |         const match = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform);
  292 |         return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
  293 |       });
  294 |     const before = await readZoom();
  295 |     await page.mouse.down();
  296 |     await page.mouse.move(centerX + 120, centerY + 60, { steps: 5 });
  297 |     await page.mouse.up();
  298 |     const after = await readZoom();
  299 |     expect(after.x - before.x).toBeCloseTo(120, 1);
  300 |     expect(after.y - before.y).toBeCloseTo(60, 1);
  301 | 
  302 |     // And the reset hands the fitted view back.
  303 |     await zoombar.getByRole('button', { name: 'Reset the map view' }).click();
  304 |     await expect(zoombar.getByText('1.0×')).toBeVisible();
  305 |     await expect(zoombar.getByRole('button', { name: 'Zoom the map out' })).toBeDisabled();
  306 |   });
  307 | });
  308 | 
```